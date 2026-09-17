import type {GroupFace} from '../../types/api';

/** Стопка похожих кадров в карточке группы: сверху самый резкий. */
export interface FaceStack {
  /** id верхнего лица — он же ключ стопки. */
  id: number;
  top: GroupFace;
  /** Позиция верхнего лица в `group.faces` — с неё открывается просмотрщик. */
  topIndex: number;
  /** Все кадры стопки вместе с верхним, с позициями в `group.faces`. */
  members: Array<{face: GroupFace; index: number}>;
  /** Все кадры стопки из одного ролика — внутри они идут по времени. */
  video: boolean;
}

/**
 * Разложить лица группы по стопкам. Сервер уже решил, кто с кем лежит
 * (`stack` — id верхнего лица); здесь только порядок: стопка встаёт туда, где
 * в списке её первое лицо, — список отсортирован по уверенности, и стопки
 * держат тот же порядок.
 */
export function buildStacks(faces: GroupFace[]): FaceStack[] {
  const byId = new Map<number, FaceStack>();
  const order: FaceStack[] = [];
  faces.forEach((face, index) => {
    const id = face.stack ?? face.id;
    let stack = byId.get(id);
    if (!stack) {
      stack = {id, top: face, topIndex: index, members: [], video: true};
      byId.set(id, stack);
      order.push(stack);
    }
    stack.members.push({face, index});
    if (face.id === id) {
      stack.top = face;
      stack.topIndex = index;
    }
    if (face.kind !== 'video') stack.video = false;
  });
  for (const stack of order) {
    if (stack.video) stack.members.sort((a, b) => faceMoment(a.face) - faceMoment(b.face));
  }
  return order;
}

/** С какой секунды ролика показывать лицо: начало трека, иначе кадр. */
export function faceMoment(face: GroupFace): number {
  return face.track_start ?? face.frame_time ?? 0;
}

/** Секунда, с которой открывать ролик: чуть раньше появления лица. */
export function videoStart(face: GroupFace | undefined): number | null {
  if (!face || face.kind !== 'video') return null;
  if (face.track_start == null && face.frame_time == null) return null;
  return Math.max(0, faceMoment(face) - LEAD_IN_SECONDS);
}

/** Запас перед появлением лица, чтобы не начинать ровно на полуслове. */
const LEAD_IN_SECONDS = 0.5;
