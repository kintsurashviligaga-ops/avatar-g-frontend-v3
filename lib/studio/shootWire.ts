/**
 * lib/studio/shootWire.ts — what the Interior designer and the Photographer send to /api/nanobanana/image, and the
 * ids they may name. Pure and isomorphic: the client builds it, the server (lib/studio/shootContext.ts) resolves it.
 *
 * ⚠️ THE CLIENT SENDS IDS, NEVER TEXT. Exactly like a template card's `templateId` (lib/studio/templates.ts), a
 * studio request names a style card, a room and four camera settings by short ids; every sentence that reaches the
 * paid prompt is looked up on the server, in tables that live in server-only code. A forged or stale id adds nothing.
 *
 * Interior designer: `{ kind:'interior', template:'scandinavian', room:'living-room' }`
 * Photographer:      `{ kind:'photoshoot', template:'ecom-white', lens:'85', light:'softbox', angle:'eye', dof:'shallow' }`
 * Every field but `kind` is optional; an absent or unknown one means „no directive“ (the card's own look).
 */

export type ShootKind = 'interior' | 'photoshoot';

/** `auto` = the room the photo shows (with no photo it defaults to a living room — see shootContext). */
export const ROOM_IDS = ['auto', 'living-room', 'bedroom', 'kitchen', 'bathroom', 'dining-room', 'home-office', 'kids-room', 'hallway', 'balcony'] as const;
export type RoomId = (typeof ROOM_IDS)[number];

/** Focal length in millimetres — ids, not numbers, so a wire id is always a plain string. */
export const LENS_IDS = ['24', '35', '50', '85'] as const;
export type LensId = (typeof LENS_IDS)[number];

export const LIGHT_IDS = ['window', 'softbox', 'golden', 'neon', 'flash'] as const;
export type LightId = (typeof LIGHT_IDS)[number];

export const ANGLE_IDS = ['eye', 'low', 'top'] as const;
export type AngleId = (typeof ANGLE_IDS)[number];

export const DOF_IDS = ['shallow', 'medium', 'deep'] as const;
export type DofId = (typeof DOF_IDS)[number];

export interface InteriorWire { kind: 'interior'; template?: string | null; room?: RoomId }
export interface PhotoshootWire {
  kind: 'photoshoot';
  template?: string | null;
  lens?: LensId; light?: LightId; angle?: AngleId; dof?: DofId;
}
export type StudioWire = InteriorWire | PhotoshootWire;

/** `own` membership for a readonly id list — an `includes` on the tuple, typed so it narrows. */
export const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

/** The longest id any list above (or any template id) may have — the same cap as a template card's wire id. */
export const SHOOT_ID_MAX = 40;
