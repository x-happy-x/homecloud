import {api, query} from '../api';

export interface SpeechLine {
  start: number;
  end: number;
  text: string;
  speaker?: number | null;
  name?: string | null;
  confidence?: number | null;
  /** Откуда взято имя: лицо в кадре — факт, голос — догадка. */
  source?: 'manual' | 'face' | 'voice' | null;
}

export const getSpeech = (path: string) =>
  api<{lines: SpeechLine[]; note?: string}>(`/api/speech${query({path})}`);
