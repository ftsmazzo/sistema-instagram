/**
 * Menu lateral: grupos lógicos + itens.
 */
export type NavGroup = {
  id: string;
  label: string;
};

export type NavItem = {
  path: string;
  label: string;
  groupId: string;
};

export const navGroups: NavGroup[] = [
  { id: "overview", label: "Visão geral" },
  { id: "agents", label: "Agentes & leads" },
  { id: "config", label: "Configuração" },
  { id: "account", label: "Conta" },
];

export const navItems: NavItem[] = [
  { path: "/", label: "Início", groupId: "overview" },
  { path: "/postagens", label: "Posts Instagram", groupId: "agents" },
  { path: "/agentes", label: "Agentes Instagram", groupId: "agents" },
  { path: "/whatsapp", label: "WhatsApp & leads", groupId: "agents" },
  { path: "/admin", label: "Empresa", groupId: "config" },
  { path: "/perfil", label: "Perfil", groupId: "account" },
];

export function itemsByGroup(groupId: string): NavItem[] {
  return navItems.filter((item) => item.groupId === groupId);
}
