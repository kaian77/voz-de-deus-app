// O "personal": lê os pontos do corpo de cada quadro, conta as repetições e acha o erro na hora.
// Cada exercício é uma máquina de estados (em cima → descendo → embaixo → subindo) com regras de forma.
import type { CamId } from "./data";
import { angle, dist, fromVertical, limbs, mid, P, side, type Pt } from "./pose";

export interface CoachOut {
  /** Repetição terminada (contada ou não). */
  rep?: { counted: boolean; good: boolean; issues: string[] };
  /** Frase para falar agora (o módulo de voz segura repetição da mesma frase). */
  cue?: string;
  /** Pontos com erro (pintados de vermelho). */
  bad: Set<number>;
  /** Corpo inteiro visível? */
  visible: boolean;
  /** 0..1: quanto da amplitude foi feito (barra lateral). */
  progress: number;
  /** Prancha: está na posição certa agora. */
  hold?: boolean;
  /** Texto pequeno com o ângulo principal. */
  metric?: string;
}

interface Opts { strictPullup: boolean }

type Frame = Pt[];

const need = (p: Frame, idx: number[], min = 0.5) => idx.reduce((s, i) => s + p[i].v, 0) / idx.length >= min;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Estado comum das repetições. */
class Rep {
  phase: "top" | "moving" = "top";
  min = 999;
  max = -999;
  issues = new Set<string>();
  bad = new Set<number>();
  start() { this.phase = "moving"; this.min = 999; this.max = -999; this.issues.clear(); }
  track(v: number) { if (v < this.min) this.min = v; if (v > this.max) this.max = v; }
  flag(msg: string, pts: number[], out: CoachOut) {
    this.issues.add(msg);
    out.cue = msg;
    for (const i of pts) out.bad.add(i);
  }
  end(counted: boolean): CoachOut["rep"] {
    this.phase = "top";
    return { counted, good: counted && this.issues.size === 0, issues: [...this.issues] };
  }
}

export abstract class Analyzer {
  protected r = new Rep();
  constructor(protected o: Opts) {}
  abstract update(p: Frame): CoachOut;
  protected base(visible: boolean): CoachOut { return { bad: new Set(), visible, progress: 0 }; }
}

/** Corpo na horizontal (flexão, prancha). */
function horizontal(p: Frame, l: ReturnType<typeof limbs>) {
  const a = p[l.sh], b = p[l.an];
  return Math.abs(a.x - b.x) > Math.abs(a.y - b.y) * 1.3;
}

/** Quadril acima (+) ou abaixo (−) da linha ombro→tornozelo, com y para baixo. */
function hipOffset(p: Frame, l: ReturnType<typeof limbs>) {
  const a = p[l.sh], b = p[l.an], h = p[l.hip];
  const t = (h.x - a.x) / (b.x - a.x || 1e-6);
  const lineY = a.y + (b.y - a.y) * t;
  return lineY - h.y; // positivo = quadril alto
}

class Squat extends Analyzer {
  update(p: Frame) {
    const l = limbs(side(p));
    const o = this.base(need(p, [l.sh, l.hip, l.kn, l.an]));
    if (!o.visible) return o;
    const knee = angle(p[l.hip], p[l.kn], p[l.an]);
    const lean = fromVertical(p[l.sh], p[l.hip]);
    o.metric = `joelho ${Math.round(knee)}°`;
    o.progress = clamp01((170 - knee) / 80);
    const r = this.r;
    if (r.phase === "top" && knee < 145) r.start();
    if (r.phase === "moving") {
      r.track(knee);
      if (lean > 50) r.flag("Peito pra cima, costas retas", [l.sh, l.hip], o);
      // joelho para dentro: só dá para ver de frente (os dois joelhos aparecem separados)
      const kw = Math.abs(p[25].x - p[26].x), aw = Math.abs(p[27].x - p[28].x), hw = Math.abs(p[23].x - p[24].x);
      if (need(p, [25, 26, 27, 28], 0.7) && hw > 0.05 && aw > hw * 0.8 && knee < 130 && kw < aw * 0.75)
        r.flag("Abre os joelhos, na linha dos pés", [25, 26], o);
      const shin = dist(p[l.kn], p[l.an]);
      if (need(p, [l.heel, l.foot], 0.6) && p[l.foot].y - p[l.heel].y > shin * 0.18)
        r.flag("Peso no calcanhar, não levanta o pé", [l.heel, l.foot], o);
      if (knee > 160) {
        const deep = r.min <= 100;
        if (!deep) { r.flag("Desce mais, até a coxa ficar paralela", [l.hip, l.kn], o); o.rep = r.end(false); }
        else o.rep = r.end(true);
      }
    }
    return o;
  }
}

class Pushup extends Analyzer {
  update(p: Frame) {
    const l = limbs(side(p));
    const o = this.base(need(p, [l.sh, l.el, l.wr, l.hip, l.an]));
    if (!o.visible) return o;
    if (!horizontal(p, l)) { o.cue = "Fique na posição de flexão, de lado para a câmera"; return o; }
    const elbow = angle(p[l.sh], p[l.el], p[l.wr]);
    const body = angle(p[l.sh], p[l.hip], p[l.an]);
    o.metric = `cotovelo ${Math.round(elbow)}°`;
    o.progress = clamp01((165 - elbow) / 80);
    const r = this.r;
    if (r.phase === "top" && elbow < 140) r.start();
    if (body < 160) {
      const off = hipOffset(p, l);
      const msg = off < 0 ? "Quadril caído, contrai o abdômen" : "Abaixa o quadril, corpo reto";
      if (r.phase === "moving") r.flag(msg, [l.hip], o); else { o.cue = msg; o.bad.add(l.hip); }
    }
    if (r.phase === "moving") {
      r.track(elbow);
      if (elbow > 155) {
        if (r.min > 95) { r.flag("Desce mais, peito perto do chão", [l.el], o); o.rep = r.end(false); }
        else o.rep = r.end(true);
      }
    }
    return o;
  }
}

class Pullup extends Analyzer {
  private lowering = false;
  private swing = { min: 9, max: -9 };
  private bent = false;
  update(p: Frame) {
    const o = this.base(need(p, [11, 12, 13, 14, 15, 16, 0]));
    if (!o.visible) return o;
    const bar = Math.min(p[15].y, p[16].y);
    if (bar > p[0].y) { o.cue = "Segure na barra com os braços esticados"; return o; }
    const el = (angle(p[11], p[13], p[15]) + angle(p[12], p[14], p[16])) / 2;
    const chin = this.o.strictPullup ? mid(p[9], p[10]).y + (mid(p[9], p[10]).y - p[0].y) * 0.8 : p[0].y;
    const shW = dist(p[11], p[12]) || 0.1;
    // quanto o queixo passou da barra (positivo = passou)
    const over = (bar - chin) / shW;
    o.metric = over > 0 ? "queixo acima da barra ✓" : `faltam ${Math.round(-over * 100)}%`;
    const hang = p[11].y - bar;
    o.progress = clamp01(1 - (chin - bar) / (hang + shW * 1.2 || 1));
    const r = this.r;
    if (r.phase === "top" && el < 135) { r.start(); this.lowering = false; this.bent = false; this.swing = { min: 9, max: -9 }; }
    if (r.phase === "moving") {
      r.track(over);
      const hx = mid(p[23], p[24]).x;
      if (p[23].v > 0.4) { this.swing.min = Math.min(this.swing.min, hx); this.swing.max = Math.max(this.swing.max, hx); }
      if ((this.swing.max - this.swing.min) / shW > 0.6) r.flag("Sem balançar o corpo", [23, 24], o);
      if (Math.abs(p[15].y - p[16].y) / shW > 0.5) r.flag("Puxe com os dois braços igual", [13, 14], o);
      if (r.max > 0 && !this.lowering) { this.lowering = true; o.cue = "Passou! Agora desce controlando"; }
      // desceu sem esticar e já puxou de novo
      if (this.lowering && el > 125) this.bent = true;
      if (this.lowering && this.bent && el < 110 && over < -0.3) {
        r.flag("Estica os braços lá embaixo", [13, 14], o);
        o.rep = r.end(true);
        r.start(); this.lowering = false; this.bent = false;
        return o;
      }
      if (el > 155) {
        if (r.max <= 0) { r.flag("Não passou! O queixo tem que passar da barra", [0, 15, 16], o); o.rep = r.end(false); }
        else o.rep = r.end(true);
      }
    }
    return o;
  }
}

class Curl extends Analyzer {
  private lean0 = 0;
  update(p: Frame) {
    const l = limbs(side(p));
    const o = this.base(need(p, [l.sh, l.el, l.wr, l.hip]));
    if (!o.visible) return o;
    const el = angle(p[l.sh], p[l.el], p[l.wr]);
    const arm = angle(p[l.hip], p[l.sh], p[l.el]);
    const lean = fromVertical(p[l.sh], p[l.hip]);
    o.metric = `cotovelo ${Math.round(el)}°`;
    o.progress = clamp01((160 - el) / 110);
    const r = this.r;
    if (r.phase === "top" && el < 130) { r.start(); this.lean0 = lean; }
    if (r.phase === "moving") {
      r.track(el);
      if (arm > 35) r.flag("Cotovelo colado no corpo", [l.el], o);
      if (lean - this.lean0 > 15) r.flag("Não jogue o tronco, só o braço trabalha", [l.sh, l.hip], o);
      if (el > 145) {
        if (r.min > 65) { r.flag("Sobe até o fim", [l.wr], o); o.rep = r.end(false); }
        else o.rep = r.end(true);
      }
    }
    return o;
  }
}

class Press extends Analyzer {
  update(p: Frame) {
    const o = this.base(need(p, [11, 12, 13, 14, 15, 16]));
    if (!o.visible) return o;
    const el = (angle(p[11], p[13], p[15]) + angle(p[12], p[14], p[16])) / 2;
    const shW = dist(p[11], p[12]) || 0.1;
    const top = p[15].y < p[0].y && p[16].y < p[0].y;
    o.metric = `braços ${Math.round(el)}°`;
    o.progress = clamp01((el - 80) / 90);
    const r = this.r;
    // aqui a repetição começa embaixo: "top" = braço dobrado na altura do ombro
    if (r.phase === "top" && el > 120 && top) r.start();
    if (r.phase === "moving") {
      r.track(el);
      if (Math.abs(p[15].y - p[16].y) / shW > 0.35) r.flag("Os dois braços juntos", [15, 16], o);
      if (fromVertical(mid(p[11], p[12]), mid(p[23], p[24])) > 15 && p[23].v > 0.5) r.flag("Não arqueia as costas", [23, 24], o);
      if (el < 100) {
        if (r.max < 155) { r.flag("Estica os braços lá em cima", [13, 14], o); o.rep = r.end(false); }
        else o.rep = r.end(true);
      }
    }
    return o;
  }
}

class Lunge extends Analyzer {
  update(p: Frame) {
    const o = this.base(need(p, [23, 24, 25, 26, 27, 28, 11, 12], 0.45));
    if (!o.visible) return o;
    const kl = angle(p[23], p[25], p[27]), kr = angle(p[24], p[26], p[28]);
    const knee = Math.min(kl, kr);
    const front = kl < kr ? limbs("l") : limbs("r");
    const lean = fromVertical(mid(p[11], p[12]), mid(p[23], p[24]));
    o.metric = `joelho ${Math.round(knee)}°`;
    o.progress = clamp01((170 - knee) / 80);
    const r = this.r;
    if (r.phase === "top" && knee < 145) r.start();
    if (r.phase === "moving") {
      r.track(knee);
      if (lean > 25) r.flag("Tronco reto", [11, 12, 23, 24], o);
      const shin = dist(p[front.kn], p[front.an]);
      if (Math.abs(p[front.kn].x - p[front.foot].x) > shin * 0.45 && knee < 120 && p[front.foot].v > 0.5)
        r.flag("Joelho da frente não passa da ponta do pé", [front.kn], o);
      if (knee > 160) {
        if (r.min > 105) { r.flag("Desce mais, joelho a 90 graus", [front.kn], o); o.rep = r.end(false); }
        else o.rep = r.end(true);
      }
    }
    return o;
  }
}

class Plank extends Analyzer {
  update(p: Frame) {
    const l = limbs(side(p));
    const o = this.base(need(p, [l.sh, l.hip, l.an]));
    if (!o.visible) return o;
    const body = angle(p[l.sh], p[l.hip], p[l.an]);
    o.metric = `corpo ${Math.round(body)}°`;
    o.progress = clamp01((body - 130) / 45);
    if (!horizontal(p, l)) { o.cue = "Deita na posição de prancha, de lado para a câmera"; return o; }
    if (body < 162) {
      const off = hipOffset(p, l);
      o.cue = off < 0 ? "Quadril caiu, sobe um pouco" : "Abaixa o bumbum, corpo reto";
      o.bad.add(l.hip);
      o.hold = false;
    } else o.hold = true;
    return o;
  }
}

class Lateral extends Analyzer {
  update(p: Frame) {
    const o = this.base(need(p, [11, 12, 13, 14, 23, 24]));
    if (!o.visible) return o;
    const al = angle(p[23], p[11], p[13]), ar = angle(p[24], p[12], p[14]);
    const a = (al + ar) / 2;
    o.metric = `braços ${Math.round(a)}°`;
    o.progress = clamp01(a / 90);
    const r = this.r;
    if (r.phase === "top" && a > 35) r.start();
    if (r.phase === "moving") {
      r.track(a);
      if (a > 115) r.flag("Para na linha do ombro", [13, 14], o);
      if (Math.abs(al - ar) > 25) r.flag("Os dois braços na mesma altura", [13, 14], o);
      if (a < 25) {
        if (r.max < 75) { r.flag("Sobe até a altura do ombro", [13, 14], o); o.rep = r.end(false); }
        else o.rep = r.end(true);
      }
    }
    return o;
  }
}

class Bridge extends Analyzer {
  update(p: Frame) {
    const l = limbs(side(p));
    const o = this.base(need(p, [l.sh, l.hip, l.kn]));
    if (!o.visible) return o;
    const hip = angle(p[l.sh], p[l.hip], p[l.kn]);
    o.metric = `quadril ${Math.round(hip)}°`;
    o.progress = clamp01((hip - 110) / 60);
    const r = this.r;
    if (r.phase === "top" && hip > 140) r.start();
    if (r.phase === "moving") {
      r.track(hip);
      if (hip < 130) {
        if (r.max < 162) { r.flag("Sobe mais o quadril, aperta o glúteo", [l.hip], o); o.rep = r.end(false); }
        else o.rep = r.end(true);
      }
    }
    return o;
  }
}

class Jack extends Analyzer {
  update(p: Frame) {
    const o = this.base(need(p, [11, 12, 15, 16, 27, 28, 0], 0.45));
    if (!o.visible) return o;
    const shW = dist(p[11], p[12]) || 0.1;
    const hands = p[15].y < p[0].y && p[16].y < p[0].y;
    const feet = Math.abs(p[27].x - p[28].x) / shW;
    o.progress = clamp01(((p[11].y - Math.min(p[15].y, p[16].y)) / (shW * 2.2)) * 0.6 + clamp01((feet - 0.8) / 0.8) * 0.4);
    const r = this.r;
    if (r.phase === "top" && (p[15].y < p[11].y || feet > 1.2)) r.start();
    if (r.phase === "moving") {
      r.track(hands && feet > 1.3 ? 1 : 0);
      if (p[15].y > p[11].y && p[16].y > p[11].y && feet < 1.1) {
        if (r.max < 1) { r.flag(hands ? "Abre mais as pernas" : "Mãos lá em cima da cabeça", hands ? [27, 28] : [15, 16], o); o.rep = r.end(false); }
        else o.rep = r.end(true);
      }
    }
    return o;
  }
}

class Stiff extends Analyzer {
  update(p: Frame) {
    const l = limbs(side(p));
    const o = this.base(need(p, [l.sh, l.hip, l.kn, l.an]));
    if (!o.visible) return o;
    const hip = angle(p[l.sh], p[l.hip], p[l.kn]);
    const knee = angle(p[l.hip], p[l.kn], p[l.an]);
    o.metric = `quadril ${Math.round(hip)}°`;
    o.progress = clamp01((170 - hip) / 75);
    const r = this.r;
    if (r.phase === "top" && hip < 150) r.start();
    if (r.phase === "moving") {
      r.track(hip);
      if (knee < 135) r.flag("Joelho quase esticado, quem desce é o quadril", [l.kn], o);
      // o punho (peso) tem que descer perto da perna
      if (p[l.wr].v > 0.5 && Math.abs(p[l.wr].x - p[l.kn].x) > dist(p[l.hip], p[l.kn]) * 0.55 && hip < 130)
        r.flag("Peso perto da perna", [l.wr], o);
      if (hip > 165) {
        if (r.min > 110) { r.flag("Desce mais, leva o quadril para trás", [l.hip], o); o.rep = r.end(false); }
        else o.rep = r.end(true);
      }
    }
    return o;
  }
}

class Row extends Analyzer {
  private lean0 = 0;
  update(p: Frame) {
    const l = limbs(side(p));
    const o = this.base(need(p, [l.sh, l.el, l.wr, l.hip]));
    if (!o.visible) return o;
    const lean = fromVertical(p[l.sh], p[l.hip]);
    const el = angle(p[l.sh], p[l.el], p[l.wr]);
    o.metric = `cotovelo ${Math.round(el)}°`;
    o.progress = clamp01((165 - el) / 85);
    if (lean < 25) { o.cue = "Incline o tronco à frente"; o.bad.add(l.sh); o.bad.add(l.hip); return o; }
    const r = this.r;
    if (r.phase === "top" && el < 135) { r.start(); this.lean0 = lean; }
    if (r.phase === "moving") {
      r.track(el);
      if (Math.abs(lean - this.lean0) > 15) r.flag("Tronco parado, só o braço puxa", [l.sh, l.hip], o);
      if (el > 150) {
        if (r.min > 95) { r.flag("Puxa até a barriga", [l.el], o); o.rep = r.end(false); }
        else o.rep = r.end(true);
      }
    }
    return o;
  }
}

class Burpee extends Analyzer {
  private stage: "up" | "down" | "plank" = "up";
  private plank = false;
  private sag = false;
  update(p: Frame) {
    const l = limbs(side(p));
    const o = this.base(need(p, [l.sh, l.hip, l.kn, l.an], 0.45));
    if (!o.visible) return o;
    const lean = fromVertical(p[l.sh], p[l.hip]);
    const knee = angle(p[l.hip], p[l.kn], p[l.an]);
    const flat = horizontal(p, l) && lean > 60;
    const standing = lean < 25 && knee > 155;
    o.progress = this.stage === "up" ? 0 : this.stage === "down" ? 0.5 : 1;
    if (this.stage === "up" && !standing && (knee < 120 || lean > 40)) { this.stage = "down"; this.plank = false; this.sag = false; this.r.issues.clear(); }
    if (this.stage !== "up") {
      if (flat) {
        this.plank = true; this.stage = "plank";
        if (angle(p[l.sh], p[l.hip], p[l.an]) < 150) this.sag = true;
      }
      if (standing) {
        this.stage = "up";
        if (!this.plank) { this.r.flag("Joga as pernas para trás até a prancha", [l.an], o); o.rep = this.r.end(false); }
        else {
          if (this.sag) this.r.flag("Na prancha, corpo reto", [l.hip], o);
          o.rep = this.r.end(true);
        }
      }
    }
    o.metric = this.stage === "plank" ? "prancha ✓" : this.stage === "down" ? "agachou" : "em pé";
    return o;
  }
}

class Situp extends Analyzer {
  update(p: Frame) {
    const l = limbs(side(p));
    const o = this.base(need(p, [l.sh, l.hip, l.kn]));
    if (!o.visible) return o;
    // tronco em relação ao chão: 0 = deitado, 90 = sentado
    const elev = 90 - fromVertical(p[l.sh], p[l.hip]);
    o.metric = `tronco ${Math.round(elev)}°`;
    o.progress = clamp01(elev / 60);
    const r = this.r;
    if (r.phase === "top" && elev > 22) r.start();
    if (r.phase === "moving") {
      r.track(elev);
      // mão puxando a cabeça para a frente
      const ear = p[l.sh === 11 ? 7 : 8];
      if (ear.v > 0.5 && p[l.wr].v > 0.5 && dist(p[l.wr], ear) < dist(p[l.sh], p[l.el]) * 0.5 && fromVertical(ear, p[l.sh]) < 15 && elev < 40)
        r.flag("Não puxa a cabeça com a mão", [l.wr], o);
      if (elev < 12) {
        if (r.max < 45) { r.flag("Sobe mais o tronco", [l.sh], o); o.rep = r.end(false); }
        else o.rep = r.end(true);
      }
    }
    return o;
  }
}

export function makeAnalyzer(ex: CamId, o: Opts): Analyzer {
  const C = { squat: Squat, pushup: Pushup, pullup: Pullup, curl: Curl, press: Press, lunge: Lunge, plank: Plank, lateral: Lateral, bridge: Bridge, jack: Jack, stiff: Stiff, row: Row, burpee: Burpee, situp: Situp }[ex];
  return new C(o);
}

export { P };
