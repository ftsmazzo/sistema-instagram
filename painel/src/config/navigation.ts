/**
 * Menu lateral — pilares: visão geral, canais, conteúdo, configuração.
 */
export type NavGroup = {
  id: string;
  label: string;
};

export type NavItem = {
  path: string;
  label: string;
  groupId: string;
  /** Rotas legadas que também marcam este item como ativo */
  aliases?: string[];
};

export const navGroups: NavGroup[] = [
  { id: "overview", label: "Visão geral" },
  { id: "channels", label: "Canais" },
  { id: "content", label: "Conteúdo" },
  { id: "config", label: "Configuração" },
];

export const navItems: NavItem[] = [
  { path: "/", label: "Início", groupId: "overview" },
  { path: "/operacao", label: "Operação", groupId: "overview" },
  {
    path: "/instagram",
    label: "Instagram",
    groupId: "channels",
    aliases: ["/postagens", "/agentes"],
  },
  { path: "/whatsapp", label: "WhatsApp", groupId: "channels", aliases: [] },
  { path: "/postador", label: "Criar post", groupId: "content" },
  { path: "/agenda", label: "Agenda", groupId: "content", aliases: ["/cronograma"] },
  { path: "/empresa", label: "Empresa", groupId: "config", aliases: ["/admin"] },
  { path: "/conta", label: "Conta", groupId: "config", aliases: ["/perfil"] },
];

export function itemsByGroup(groupId: string): NavItem[] {
  return navItems.filter((item) => item.groupId === groupId);
}

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (item.path === "/") return pathname === "/";
  const paths = [item.path, ...(item.aliases ?? [])];
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function getPageTitle(pathname: string): string {
  const item = navItems.find((n) => isNavItemActive(pathname, n));
  if (item) return item.label;
  if (pathname.startsWith("/login")) return "Entrar";
  return "Vende24";
}

/** Redirects de rotas antigas → novas */
export const legacyRedirects: Record<string, string> = {
  "/admin": "/empresa",
  "/perfil": "/conta",
  "/cronograma": "/agenda",
  "/postagens": "/instagram",
  "/agentes": "/instagram?tab=agente",
};
