import { useColorScheme } from 'react-native';

export interface Theme {
  bg: string;
  card: string;
  border: string;
  text: string;
  muted: string;
  primary: string;
  primaryText: string;
  bar: string;
  barDim: string;
  danger: string;
  ok: string;
  input: string;
}

const light: Theme = {
  bg: '#F1F5F9',
  card: '#FFFFFF',
  border: '#E2E8F0',
  text: '#0F172A',
  muted: '#64748B',
  primary: '#0284C7',
  primaryText: '#FFFFFF',
  bar: '#0EA5E9',
  barDim: '#E2E8F0',
  danger: '#DC2626',
  ok: '#16A34A',
  input: '#F8FAFC',
};

const dark: Theme = {
  bg: '#0B1220',
  card: '#111B2E',
  border: '#1E2A44',
  text: '#E5EDF9',
  muted: '#8A9AB5',
  primary: '#38BDF8',
  primaryText: '#04202F',
  bar: '#38BDF8',
  barDim: '#1E2A44',
  danger: '#F87171',
  ok: '#4ADE80',
  input: '#0D1626',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
