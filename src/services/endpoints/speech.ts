import {api, query} from '../api';

/** Кто говорит. Порядок доверия: назначено руками → лицо в кадре → похожий голос. */
export interface SpeechPerson {
  name: string;
  confidence: number;
  source: 'manual' | 'face' | 'voice';
}

export interface SpeechSegment {
  start: number;
  stop: number;
  text: string;
  /** Метка диаризации вроде «SPEAKER_00»; пусто, если голоса не разделяли. */
  speaker?: string | null;
  person?: SpeechPerson | null;
}

export interface SpeechData {
  status: string;
  language: string;
  model: string;
  /** Сколько разных голосов нашлось в ролике. */
  speakers: number;
  segments: SpeechSegment[];
}

export const getSpeech = (path: string) => api<SpeechData>(`/api/speech${query({path})}`);
