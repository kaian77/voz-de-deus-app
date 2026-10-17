import { Link } from "react-router-dom";
import { useStudioTheme } from "../components/bits";

// Páginas públicas exigidas pela Meta e pelo TikTok para publicar o app:
// política de privacidade, termos de uso e instruções de exclusão de dados.

const UPDATED = "17 de outubro de 2026";

type Doc = { title: string; sections: { heading: string; body: string[] }[] };

const DOCS: Record<"privacidade" | "termos" | "exclusao-de-dados", Doc> = {
  privacidade: {
    title: "Política de Privacidade",
    sections: [
      {
        heading: "O que é o Social Studio",
        body: [
          "O Social Studio é uma ferramenta de gestão de redes sociais. Com ela, o titular de uma conta profissional do Instagram, do TikTok, do WhatsApp ou de um canal do YouTube agenda publicações, responde comentários e mensagens e acompanha o desempenho do próprio perfil.",
        ],
      },
      {
        heading: "Dados que coletamos",
        body: [
          "Dados da conta conectada: identificador, nome de usuário, nome, foto de perfil, biografia, número de seguidores e de publicações.",
          "Conteúdo da conta: publicações e métricas públicas (curtidas, comentários), comentários recebidos e mensagens enviadas para a conta, com o nome de usuário de quem comentou ou escreveu.",
          "Tokens de acesso emitidos pela Meta, pelo TikTok ou pelo provedor de WhatsApp. Eles servem para agir em nome da conta conectada.",
          "Conteúdo criado no próprio Studio: rascunhos, imagens, legendas, agendamentos, automações e configurações da marca.",
          "E-mail e senha de acesso ao Studio. A senha é guardada pelo serviço de autenticação, nunca em texto aberto.",
        ],
      },
      {
        heading: "Como usamos os dados",
        body: [
          "Somente para fazer o que o titular da conta pede: publicar conteúdo, responder comentários e mensagens conforme as automações configuradas, mostrar métricas e gerar sugestões de conteúdo.",
          "Textos de comentários, mensagens e do perfil podem ser enviados a um provedor de inteligência artificial (Anthropic) apenas para redigir respostas e análises solicitadas pelo titular. Esses dados não são usados para treinar modelos.",
          "Não vendemos, alugamos nem compartilhamos dados com anunciantes.",
        ],
      },
      {
        heading: "YouTube (Serviços de API do YouTube)",
        body: [
          "O Studio usa os Serviços de API do YouTube para que o titular publique vídeos no próprio canal. Ao conectar um canal, autorizamos apenas o envio de vídeos e capas (youtube.upload), a leitura de dados do canal e de vídeos públicos (youtube.readonly) e a exclusão, a pedido do titular, de vídeos que o próprio Studio enviou (youtube.force-ssl).",
          "Dados do YouTube que guardamos: identificador, nome e foto do canal conectado; os vídeos que o próprio Studio enviou (identificador, título, capa e data de publicação); e títulos e números públicos de visualizações de vídeos do nicho, usados só para sugerir temas ao titular. Não acessamos inscritos, comentários, mensagens nem dados privados de outras pessoas.",
          "Os dados do YouTube não são vendidos nem compartilhados com terceiros. A Política de Privacidade do Google também se aplica: https://policies.google.com/privacy",
          "Você pode revogar o acesso do Studio ao seu canal a qualquer momento em https://myaccount.google.com/permissions. Ao revogar ou desconectar, apagamos o token e os dados do canal guardados no Studio em até 7 dias.",
        ],
      },
      {
        heading: "Onde os dados ficam",
        body: [
          "Os dados ficam em um banco de dados gerenciado (Supabase), com acesso restrito ao titular da conta por regras de segurança no nível de cada registro. Os tokens de acesso não são acessíveis pelo navegador.",
        ],
      },
      {
        heading: "Por quanto tempo",
        body: [
          "Enquanto a conta estiver conectada. Ao desconectar uma rede ou pedir a exclusão, os dados dessa conta são apagados, conforme a página de exclusão de dados.",
        ],
      },
      {
        heading: "Seus direitos",
        body: [
          "Você pode acessar, corrigir ou apagar seus dados a qualquer momento, com base na Lei Geral de Proteção de Dados (Lei 13.709/2018). Veja como em “Exclusão de dados”.",
        ],
      },
    ],
  },
  termos: {
    title: "Termos de Uso",
    sections: [
      {
        heading: "Uso permitido",
        body: [
          "O Social Studio deve ser usado apenas com contas que você controla, seguindo os termos do Instagram, do TikTok e do WhatsApp.",
          "É proibido enviar spam, mensagens em massa não solicitadas ou conteúdo ilegal pela ferramenta.",
        ],
      },
      {
        heading: "Responsabilidade pelo conteúdo",
        body: [
          "Você é responsável pelo que publica e pelas respostas configuradas nas automações. Respostas geradas por IA podem conter erros e devem ser revisadas quando necessário.",
        ],
      },
      {
        heading: "YouTube",
        body: [
          "A integração com o YouTube usa os Serviços de API do YouTube. Ao conectar um canal, você concorda com os Termos de Serviço do YouTube: https://www.youtube.com/t/terms",
          "Os vídeos são enviados apenas para o canal que você conectou e escolheu, com conteúdo original gerado no Studio, e devem seguir as Diretrizes da Comunidade do YouTube.",
        ],
      },
      {
        heading: "Disponibilidade",
        body: [
          "As integrações dependem das APIs de terceiros (Meta, TikTok, Google/YouTube, provedores de WhatsApp), que podem mudar ou ficar indisponíveis sem aviso.",
        ],
      },
    ],
  },
  "exclusao-de-dados": {
    title: "Exclusão de dados",
    sections: [
      {
        heading: "Desconectar uma rede",
        body: [
          "No Social Studio, abra Contas e toque em Desconectar ao lado da conta. A conta, os tokens de acesso e os comentários e conversas ligados a ela são apagados na hora.",
        ],
      },
      {
        heading: "Remover o acesso pelo Instagram ou Facebook",
        body: [
          "No Instagram: Configurações → Aplicativos e sites → remova o Social Studio. No Facebook: Configurações → Aplicativos e sites. Depois disso, o Studio perde o acesso e deixa de receber novos dados.",
        ],
      },
      {
        heading: "Remover o acesso ao YouTube",
        body: [
          "Em https://myaccount.google.com/permissions, remova o app do Studio. O Studio perde o acesso ao canal na hora e o token e os dados do canal guardados são apagados em até 7 dias.",
        ],
      },
      {
        heading: "Apagar tudo",
        body: [
          "Para apagar também sua conta de acesso ao Studio e todo o conteúdo criado nele, envie uma mensagem pelo direct do perfil que usa o Studio pedindo a exclusão. Atendemos em até 15 dias e confirmamos por mensagem.",
        ],
      },
    ],
  },
};

export default function Legal({ doc }: { doc: keyof typeof DOCS }) {
  useStudioTheme();
  const d = DOCS[doc];
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-2.5 px-4 py-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-[12px] font-semibold text-background">S</span>
          <Link to="/studio" className="text-[13px] font-semibold">Social Studio</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">{d.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Última atualização: {UPDATED}</p>
        <div className="mt-8 space-y-8">
          {d.sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-base font-semibold">{s.heading}</h2>
              <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-foreground/85">
                {s.body.map((p, i) => (
                  <p key={i}>
                    {p.split(/(https:\/\/\S+)/).map((part, j) =>
                      part.startsWith("https://") ? <a key={j} href={part} target="_blank" rel="noreferrer" className="underline">{part}</a> : part,
                    )}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
        <nav className="mt-12 flex flex-wrap gap-4 border-t pt-6 text-sm text-muted-foreground">
          <Link to="/privacidade" className="hover:text-foreground">Privacidade</Link>
          <Link to="/termos" className="hover:text-foreground">Termos de uso</Link>
          <Link to="/exclusao-de-dados" className="hover:text-foreground">Exclusão de dados</Link>
        </nav>
      </main>
    </div>
  );
}
