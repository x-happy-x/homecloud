import type {AdultRating, PhotoKind} from './domain';

export interface SessionUser {
  name: string;
  role: 'admin' | 'editor' | 'viewer' | string;
  display?: string;
  bigfam_id?: number | null;
}

export interface SessionResponse {
  user: SessionUser | null;
  bigfam_url?: string;
}

export interface KinPerson {
  id: number;
  name: string;
  first?: string;
  last?: string;
  middle?: string;
  birth?: string;
  death?: string;
  deceased?: boolean;
}

/** Группа лиц: либо названный человек, либо автоматическая гроздь. */
export interface Group {
  key: string;
  name?: string | null;
  bigfam_id?: number | null;
  faces: number;
  photos?: number;
  face_ids?: number[];
  covers?: string[];
  avatar?: string | null;
  avatar_pinned?: boolean;
  hidden?: boolean;
}

export interface Face {
  id: number;
  path: string;
  thumbnail?: string;
  name?: string | null;
  bigfam_id?: number | null;
  frame_time?: number | null;
  confidence?: number;
}

export interface CatalogStats {
  photos: number;
  videos?: number;
  faces: number;
  with_faces: number;
  indexed?: number;
  ocr?: number;
  captioned?: number;
  adult?: number;
}

export interface Album {
  id: number;
  title: string;
  parent: number;
  photos?: number;
  cover?: string | null;
  hidden?: boolean;
  effectively_hidden?: boolean;
  children?: Album[];
}

export interface PhotoSummary {
  path: string;
  preview: string;
  video?: string;
  kind?: PhotoKind;
  taken?: string | null;
  modified?: string | null;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  adult_rating?: AdultRating | null;
  blurry?: boolean;
  hidden?: boolean;
}

export interface PhotosPage {
  photos: PhotoSummary[];
  total: number;
}
