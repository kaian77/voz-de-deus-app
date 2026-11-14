// Textos do Coração 3D (pt/en/es), em linguagem simples para o paciente. Didático: não substitui a avaliação médica.
import type { V3 } from "./sdf";

type L = { pt: string; en: string; es: string };
export type Spot = {
  id: string; at: V3; dir: V3; name: L; text: L; num?: number; cut?: number; cam?: { pos: V3; target: V3 };
  /** Anel amarelo de destaque: centro, eixo e raio (no defeito). */
  ring?: { at: V3; axis: V3; r: number };
};

const l = (pt: string, en: string, es: string): L => ({ pt, en, es });

export const STRUCTURES: Spot[] = [
  { id: "ra", at: [-4.1, 0.9, 0.6], dir: [-1, 0, 0.4], name: l("Átrio direito", "Right atrium", "Aurícula derecha"),
    text: l("Recebe o sangue sem oxigênio que volta do corpo pelas veias cavas.", "Receives the oxygen-poor blood coming back from the body through the venae cavae.", "Recibe la sangre sin oxígeno que vuelve del cuerpo por las venas cavas.") },
  { id: "rv", at: [-1.2, -1.9, 2.4], dir: [-0.3, -0.2, 1], name: l("Ventrículo direito", "Right ventricle", "Ventrículo derecho"),
    text: l("Bombeia esse sangue para os pulmões, pela artéria pulmonar, para pegar oxigênio.", "Pumps that blood to the lungs, through the pulmonary artery, to pick up oxygen.", "Bombea esa sangre a los pulmones, por la arteria pulmonar, para que tome oxígeno.") },
  { id: "la", at: [2.9, 1.8, -2.4], dir: [0.6, 0.3, -0.6], name: l("Átrio esquerdo", "Left atrium", "Aurícula izquierda"),
    text: l("Recebe o sangue rico em oxigênio que volta dos pulmões pelas veias pulmonares.", "Receives the oxygen-rich blood returning from the lungs through the pulmonary veins.", "Recibe la sangre rica en oxígeno que vuelve de los pulmones por las venas pulmonares.") },
  { id: "lv", at: [3.1, -2.2, 0.4], dir: [1, -0.3, 0.3], name: l("Ventrículo esquerdo", "Left ventricle", "Ventrículo izquierdo"),
    text: l("A câmara mais forte: bombeia o sangue com oxigênio para o corpo todo pela aorta.", "The strongest chamber: it pumps oxygen-rich blood to the whole body through the aorta.", "La cámara más fuerte: bombea la sangre con oxígeno a todo el cuerpo por la aorta.") },
  { id: "aorta", at: [-0.6, 4.4, 1.2], dir: [0, 0.3, 1], name: l("Aorta", "Aorta", "Aorta"),
    text: l("A maior artéria do corpo. Leva o sangue com oxigênio para todos os órgãos.", "The largest artery in the body. It carries oxygen-rich blood to every organ.", "La arteria más grande del cuerpo. Lleva la sangre con oxígeno a todos los órganos.") },
  { id: "pa", at: [1.5, 3.7, 2.2], dir: [0.4, 0.3, 1], name: l("Artéria pulmonar", "Pulmonary artery", "Arteria pulmonar"),
    text: l("Leva o sangue do ventrículo direito para os pulmões.", "Carries blood from the right ventricle to the lungs.", "Lleva la sangre del ventrículo derecho a los pulmones.") },
  { id: "vc", at: [-2.5, 5.4, 0.5], dir: [-0.5, 0, 1], name: l("Veia cava", "Vena cava", "Vena cava"),
    text: l("Traz de volta ao coração o sangue que já deixou o oxigênio no corpo.", "Brings back to the heart the blood that has already delivered its oxygen to the body.", "Trae de vuelta al corazón la sangre que ya dejó el oxígeno en el cuerpo.") },
  { id: "cor", at: [1.4, -0.4, 2.3], dir: [0.3, 0, 1], name: l("Coronárias", "Coronary arteries", "Coronarias"),
    text: l("Artérias finas sobre o coração que alimentam o próprio músculo cardíaco.", "Small arteries on the surface that feed the heart muscle itself.", "Arterias finas sobre el corazón que alimentan al propio músculo cardíaco.") },
];

export const DEFECTS: Spot[] = [
  { id: "civ", num: 1, at: [0.05, 0.5, 0.6], dir: [0, 0, 1], cut: 0.33,
    cam: { pos: [-3.2, 0.9, 13], target: [-0.2, 0.0, 0.4] }, ring: { at: [0.05, 0.55, 0.55], axis: [-0.71, 0.09, 0.69], r: 0.85 },
    name: l("Comunicação interventricular (CIV)", "Ventricular septal defect (VSD)", "Comunicación interventricular (CIV)"),
    text: l("Um buraco na parede (septo) que separa os dois ventrículos. Por ele, sangue sem oxigênio do lado direito passa para o lado esquerdo.",
      "A hole in the wall (septum) between the two ventricles. Oxygen-poor blood from the right side passes through it to the left side.",
      "Un agujero en la pared (tabique) que separa los dos ventrículos. Por él, sangre sin oxígeno del lado derecho pasa al lado izquierdo.") },
  { id: "ps", num: 2, at: [0.0, 1.45, 2.4], dir: [0, 0.2, 1], cut: 0.12,
    cam: { pos: [-2.4, 2.4, 13], target: [0.0, 1.6, 1.4] }, ring: { at: [-0.2, 1.3, 1.75], axis: [0.3, 0.95, 0.2], r: 0.62 },
    name: l("Estenose pulmonar", "Pulmonary stenosis", "Estenosis pulmonar"),
    text: l("A saída do ventrículo direito para o pulmão é estreita. Chega menos sangue aos pulmões para pegar oxigênio.",
      "The exit from the right ventricle to the lungs is narrow, so less blood reaches the lungs to pick up oxygen.",
      "La salida del ventrículo derecho hacia el pulmón es estrecha. Llega menos sangre a los pulmones para tomar oxígeno.") },
  { id: "ao", num: 3, at: [-0.6, 2.6, 1.6], dir: [0, 0.3, 1], cut: 0.3,
    cam: { pos: [-3.0, 2.6, 13], target: [-0.3, 1.4, 0.4] }, ring: { at: [-0.45, 1.95, 0.6], axis: [-0.2, 0.95, 0.25], r: 1.45 },
    name: l("Aorta cavalgante", "Overriding aorta", "Aorta cabalgante"),
    text: l("A aorta nasce mais para a direita, bem em cima do buraco, e recebe sangue dos dois ventrículos, inclusive o sangue sem oxigênio.",
      "The aorta sits further to the right, right above the hole, so it receives blood from both ventricles, including oxygen-poor blood.",
      "La aorta nace más hacia la derecha, justo encima del agujero, y recibe sangre de los dos ventrículos, incluida la sangre sin oxígeno.") },
  { id: "rvh", num: 4, at: [-2.0, -1.6, 2.3], dir: [-0.4, -0.2, 1], cut: 0.4,
    cam: { pos: [-4.5, -0.5, 13], target: [-0.6, -0.8, 0.8] },
    name: l("Hipertrofia do ventrículo direito", "Right ventricular hypertrophy", "Hipertrofia del ventrículo derecho"),
    text: l("Para empurrar o sangue pela saída estreita, o músculo do ventrículo direito trabalha mais e fica grosso.",
      "To push blood through the narrow exit, the right ventricle works harder and its muscle becomes thick.",
      "Para empujar la sangre por la salida estrecha, el músculo del ventrículo derecho trabaja más y se engrosa.") },
];

export const INTRO = {
  normal: {
    title: l("Coração normal", "Normal heart", "Corazón normal"),
    text: l("Tem 4 câmaras. O lado direito recebe o sangue do corpo (azul) e manda para os pulmões; o lado esquerdo recebe o sangue com oxigênio (vermelho) e manda para o corpo. Os dois lados não se misturam.",
      "It has 4 chambers. The right side receives blood from the body (blue) and sends it to the lungs; the left side receives oxygen-rich blood (red) and sends it to the body. The two sides never mix.",
      "Tiene 4 cámaras. El lado derecho recibe la sangre del cuerpo (azul) y la envía a los pulmones; el lado izquierdo recibe la sangre con oxígeno (roja) y la envía al cuerpo. Los dos lados no se mezclan."),
  },
  tof: {
    title: l("Tetralogia de Fallot", "Tetralogy of Fallot", "Tetralogía de Fallot"),
    text: l("São 4 alterações juntas. Toque nos números para ver cada uma. Como parte do sangue sem oxigênio vai direto para o corpo (roxo), a pele e os lábios podem ficar arroxeados.",
      "Four changes at the same time. Tap the numbers to see each one. Because some oxygen-poor blood goes straight to the body (purple), the skin and lips can look bluish.",
      "Son 4 alteraciones juntas. Toca los números para ver cada una. Como parte de la sangre sin oxígeno va directo al cuerpo (morado), la piel y los labios pueden verse morados."),
  },
  both: {
    title: l("Lado a lado", "Side by side", "Lado a lado"),
    text: l("À esquerda, o coração normal; à direita, a tetralogia de Fallot. Repare na aorta mais larga, na artéria pulmonar fina e no ventrículo direito mais grosso.",
      "Left: normal heart. Right: tetralogy of Fallot. Notice the wider aorta, the thin pulmonary artery and the thicker right ventricle.",
      "A la izquierda, el corazón normal; a la derecha, la tetralogía de Fallot. Observa la aorta más ancha, la arteria pulmonar fina y el ventrículo derecho más grueso."),
  },
};

export const TREATMENT = l(
  "O tratamento costuma ser uma cirurgia que fecha o buraco com um remendo e alarga a saída para o pulmão. Cada caso é único: converse com a equipe médica.",
  "Treatment is usually surgery that closes the hole with a patch and widens the exit to the lungs. Every case is different: talk to your medical team.",
  "El tratamiento suele ser una cirugía que cierra el agujero con un parche y amplía la salida al pulmón. Cada caso es único: conversa con el equipo médico.",
);
