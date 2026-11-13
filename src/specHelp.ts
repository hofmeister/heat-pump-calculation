/** English help texts (the source language), used for AI-facing output. */
import { help, type Help, type HelpEntry } from './locales/help.en';

export type { HelpEntry };
export const HELP: Help & Record<string, HelpEntry> = help;
