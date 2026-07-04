/**
 * Pont typé vers le design system FBL (_ds_bundle.js, chargé dynamiquement par
 * main.tsx après avoir posé `window.React` — voir main.tsx). L'UI ne redéfinit
 * jamais de style hors de ce système (contrainte de la commande produit) ;
 * ce fichier ne fait que typer la frontière, pas ajouter de comportement.
 */
import type { ReactNode, CSSProperties, InputHTMLAttributes } from "react";

export type Tone = "neutral" | "accent" | "positive" | "negative" | "caution" | "injury";

export interface ButtonProps {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  block?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  type?: "button" | "submit";
  onClick?: () => void;
  style?: CSSProperties;
  children?: ReactNode;
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> {
  label?: string;
  hint?: string;
  error?: string;
  numeric?: boolean;
  prefix?: ReactNode;
  suffix?: ReactNode;
  size?: "sm" | "md" | "lg";
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label?: string;
  hint?: string;
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  id?: string;
  style?: CSSProperties;
}

export interface TabItem {
  value: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  tabs: TabItem[];
  value?: string;
  onChange?: (value: string) => void;
  variant?: "line" | "segmented";
  style?: CSSProperties;
}

export interface BadgeProps {
  tone?: Tone;
  variant?: "soft" | "solid";
  size?: "sm" | "md";
  icon?: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
}

export interface PositionBadgeProps {
  pos: string;
  style?: CSSProperties;
}

export interface InjuryBadgeProps {
  status?: "OUT" | "DTD" | "GTD" | "OK";
  style?: CSSProperties;
}

export interface RatingBadgeProps {
  value: number;
  size?: "sm" | "md" | "lg";
  glow?: boolean;
  style?: CSSProperties;
}

export interface StatTableColumn<Row> {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  width?: number;
  numeric?: boolean;
  tooltip?: string;
  render?: (row: Row) => ReactNode;
  priority?: boolean;
}

export interface StatTableProps<Row = Record<string, unknown>> {
  columns: StatTableColumn<Row>[];
  rows: Row[];
  rowKey?: string;
  defaultSort?: { key: string; dir: "asc" | "desc" } | null;
  dense?: boolean;
  hotKey?: string;
  onRowClick?: (row: Row) => void;
  style?: CSSProperties;
}

export interface ScoreBannerTeam {
  abbr: string;
  name?: string;
  score?: number;
  record?: string;
  hot?: boolean;
}

export interface ScoreBannerProps {
  home: ScoreBannerTeam;
  away: ScoreBannerTeam;
  state?: "live" | "final" | "sched";
  period?: string;
  clock?: string;
  tipoff?: string;
  compact?: boolean;
  style?: CSSProperties;
}

export interface BoxScoreRow {
  name: string;
  pos: string;
  min: string | number;
  pts: number;
  reb: number;
  ast: number;
  fg: string;
  tp: string;
  pm: number;
  hot?: boolean;
}

export interface BoxScoreProps {
  home: ScoreBannerTeam;
  away: ScoreBannerTeam;
  state?: "live" | "final" | "sched";
  period?: string;
  clock?: string;
  lineScore?: { away: number[]; home: number[] };
  boxHome?: BoxScoreRow[];
  boxAway?: BoxScoreRow[];
  style?: CSSProperties;
}

export interface PlayByPlayEvent {
  id: string;
  clock: string;
  period: string;
  team: string;
  score: string;
  text: string;
  type?: "score" | "three" | "turnover" | "foul" | "block" | "steal" | "timeout" | "sub";
  hot?: boolean;
}

export interface PlayByPlayProps {
  events: PlayByPlayEvent[];
  homeAbbr?: string;
  awayAbbr?: string;
  maxHeight?: number;
  style?: CSSProperties;
}

export interface PlayerCardData {
  name: string;
  pos: string;
  age: number;
  team: string;
  number: number;
  ovr: number;
  contract?: string;
  status?: "OUT" | "DTD" | "GTD" | "OK";
  attributes?: { label: string; value: number }[];
  traits?: string[];
  onFire?: boolean;
}

export interface PlayerCardProps {
  player: PlayerCardData;
  style?: CSSProperties;
}

export interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title?: string;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
  danger?: boolean;
}

export interface ProgressBarProps {
  value?: number;
  max?: number;
  tone?: "accent" | "positive" | "caution" | "negative" | "fire";
  size?: "sm" | "md" | "lg";
  label?: string;
  showValue?: boolean;
  markerAt?: number | null;
  style?: CSSProperties;
}

export interface ToastProps {
  tone?: "info" | "positive" | "negative" | "caution";
  title?: string;
  message?: string;
  icon?: ReactNode;
  onClose?: () => void;
  duration?: number;
  style?: CSSProperties;
}

export interface ToastStackProps {
  children?: ReactNode;
  style?: CSSProperties;
}

export interface StandingsRow {
  rank: number;
  abbr: string;
  name: string;
  w: number;
  l: number;
  pct: string;
  gb: string;
  streak?: string;
  mine?: boolean;
}

export interface StandingsProps {
  teams: StandingsRow[];
  conference?: string;
  style?: CSSProperties;
}

export interface DsNamespace {
  Button: React.FC<ButtonProps>;
  Input: React.FC<InputProps>;
  Select: React.FC<SelectProps>;
  Tabs: React.FC<TabsProps>;
  Badge: React.FC<BadgeProps>;
  PositionBadge: React.FC<PositionBadgeProps>;
  InjuryBadge: React.FC<InjuryBadgeProps>;
  RatingBadge: React.FC<RatingBadgeProps>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- composant DS générique, chaque écran type ses propres colonnes/rows au call-site
  StatTable: React.FC<StatTableProps<any>>;
  ScoreBanner: React.FC<ScoreBannerProps>;
  BoxScore: React.FC<BoxScoreProps>;
  PlayByPlay: React.FC<PlayByPlayProps>;
  PlayerCard: React.FC<PlayerCardProps>;
  Modal: React.FC<ModalProps>;
  ProgressBar: React.FC<ProgressBarProps>;
  Toast: React.FC<ToastProps>;
  ToastStack: React.FC<ToastStackProps>;
  Standings: React.FC<StandingsProps>;
}

declare global {
  interface Window {
    FBLFireballLeagueDesignSystem_5f42ba?: DsNamespace;
  }
}

export function getDs(): DsNamespace {
  const ns = window.FBLFireballLeagueDesignSystem_5f42ba;
  if (!ns) throw new Error("Design system bundle non chargé — getDs() appelé trop tôt.");
  return ns;
}
