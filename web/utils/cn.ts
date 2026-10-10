import clsx, { type ClassValue } from 'clsx';
export { type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const typography = {
  title: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  label: ['xl', 'lg', 'md', 'sm', 'xs', '2xs'],
  paragraph: ['xl', 'lg', 'md', 'sm', 'xs'],
  subheading: ['md', 'sm', 'xs', '2xs'],
  doc: ['label', 'paragraph'],
};
const texts = Object.entries(typography).flatMap(([k, v]) => v.map((s) => `${k}-${s}`));

export const twMergeConfig = {
  extend: { classGroups: { 'font-size': [{ text: texts }] } },
};
const customTwMerge = extendTailwindMerge(twMergeConfig);
export function cn(...classes: ClassValue[]) {
  return customTwMerge(clsx(...classes));
}
