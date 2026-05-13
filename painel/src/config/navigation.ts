/**
 * Menu lateral: grupos lógicos + itens. Rotas permanecem curtas (/postador, etc.).
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
  { id: "instagram", label: "Instagram" },
  { id: "config", label: "Configuração" },
  { id: "automation", label: "Automação" },
  { id: "account", label: "Conta" },
];

export const navItems: NavItem[] = [
  { path: "/", label: "Início", groupId: "overview" },
  { path: "/postador", label: "Postador", groupId: "instagram" },

  { path: "/cronograma", label: "Cronograma", groupId: "instagram" },
  { path: "/admin", label: "Administração", groupId: "config" },

  { path: "/whatsapp", label: "WhatsApp", groupId: "automation" },
  { path: "/perfil", label: "Perfil", groupId: "account" },
];

export function itemsByGroup(groupId: string): NavItem[] {
  return navItems.filter((item) => item.groupId === groupId);
}
