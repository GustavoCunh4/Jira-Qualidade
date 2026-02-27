import { IconName } from "../components/ui/Icon";

export type NavItem = {
  to: string;
  label: string;
  icon: IconName;
  title: string;
  subtitle: string;
};

export const navItems: NavItem[] = [
  {
    to: "/",
    label: "Visao Geral",
    icon: "dashboard",
    title: "Visao Geral",
    subtitle: "KPIs, fluxo, gargalos e itens criticos da operacao de QA",
  },
  {
    to: "/people",
    label: "Pessoas",
    icon: "people",
    title: "Pessoas",
    subtitle: "Equipe interna e visao agrupada por responsavel nas issues do Jira",
  },
  {
    to: "/settings",
    label: "Configuracoes",
    icon: "settings",
    title: "Configuracoes",
    subtitle: "Conexao Jira, JQL base, diagnosticos e seguranca da conta",
  },
];

export function getPageMeta(pathname: string) {
  return navItems.find((item) => item.to === pathname) || navItems[0];
}

