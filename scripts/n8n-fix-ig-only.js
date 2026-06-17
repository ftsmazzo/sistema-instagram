/** Gera operações de correção IG-only para o workflow Agente-Instagram (DT2i65lSjtCqay4g). */
const fs = require("fs");
const old = JSON.parse(
  fs.readFileSync(
    "C:/Users/anjo_/.cursor/projects/c-Users-anjo-OneDrive-Projetos-FabriaIA-Agente-Instagram/agent-tools/1b32d352-2178-4c68-91f1-871e156b0d5a.txt",
    "utf8"
  )
);

const prepAssignments = old.workflow.nodes.find((n) => n.name === "Prep Agente Direct").parameters
  .assignments.assignments;
const commentOrigem = prepAssignments.find((a) => a.name === "comment_text_origem");
commentOrigem.value = "={{ $json.comment_text || '' }}";

const usernameField = prepAssignments.find((a) => a.name === "username_instagram");
usernameField.value =
  "={{ $('Normaliza Perfil').item.json.username_instagram || $('Contexto Direct').item.json.username_lead || '' }}";
const nomeField = prepAssignments.find((a) => a.name === "nome_perfil");
nomeField.value = "={{ $('Normaliza Perfil').item.json.nome_perfil || '' }}";

const contextoAssignments = old.workflow.nodes
  .find((n) => n.name === "Contexto")
  .parameters.assignments.assignments.map((a) => {
    if (a.name === "graph_base") {
      return {
        ...a,
        value:
          "={{ 'https://graph.instagram.com/' + String($('HTTP Config').item.json.credentials.graph_api_version || 'v24.0') }}",
      };
    }
    return a;
  });

const IG_DIRECT_URL =
  "={{ $('Prep Agente Direct').item.json.graph_base }}/{{ $('Prep Agente Direct').item.json.ctx.ig_user_id }}/messages?access_token={{ encodeURIComponent($('Prep Agente Direct').item.json.access_token) }}";

const IG_PRIVATE_URL =
  "={{ $('Prep Agente Comentário').item.json.graph_base }}/{{ $('Prep Agente Comentário').item.json.ctx.ig_user_id }}/messages?access_token={{ encodeURIComponent($('Prep Agente Comentário').item.json.access_token) }}";

const MEM_KEY =
  "={{ ($('Prep Agente Direct').item.json.ctx?.redis_prefix || $('Contexto Direct').item.json.redis_prefix) }}{{ $('Prep Agente Direct').item.json.id_insta_lead || $('Contexto Direct').item.json.id_insta_lead }}";

const ops = [
  { type: "removeConnection", source: "HTTP Config", target: "Resolve Page ID" },
  { type: "removeConnection", source: "Resolve Page ID", target: "Contexto" },
  { type: "addConnection", source: "HTTP Config", target: "Contexto" },
  { type: "setNodeDisabled", nodeName: "Resolve Page ID", disabled: true },
  {
    type: "updateNodeParameters",
    nodeName: "Contexto",
    replace: true,
    parameters: {
      mode: "manual",
      includeOtherFields: false,
      assignments: { assignments: contextoAssignments },
      options: {},
    },
  },
  {
    type: "updateNodeParameters",
    nodeName: "Prep Agente Direct",
    replace: true,
    parameters: {
      mode: "manual",
      includeOtherFields: false,
      assignments: { assignments: prepAssignments },
      options: {},
    },
  },
  { type: "setNodeParameter", nodeName: "Resposta Direct", path: "/url", value: IG_DIRECT_URL },
  { type: "setNodeParameter", nodeName: "Resposta Direct Privado", path: "/url", value: IG_PRIVATE_URL },
  { type: "setNodeParameter", nodeName: "Memoria Direct", path: "/sessionKey", value: MEM_KEY },
];

console.log(JSON.stringify(ops, null, 2));
