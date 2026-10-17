/**
 * lib/video/assembleActor.ts — who a server-made stitch request speaks for.
 *
 * POST /api/video/assemble reads its caller from the request's session cookie. A film whose tab closed is stitched by
 * the server (lib/chat/filmFollowWorker), which has no cookie: it builds the request itself and names the film's owner
 * here. The mark lives in this process's memory, keyed by the request object, so nothing a browser sends can set it;
 * every other check of the route (media ownership, the film's payer, the stitch waiver, billing) runs unchanged for
 * that owner.
 */

export interface AssembleActor {
  /** The user the film was charged to. */
  uid: string;
  /** How long the route may run for this request (the sweep's own budget, not the route's 600 s). */
  budgetMs: number;
  /**
   * The stitch is already paid for by its caller: a scene redo charged the scene's price itself (lib/chat/filmSceneRedo).
   * It uses none of the film's stitch waivers and bills nothing.
   */
  covered?: boolean;
}

const actors = new WeakMap<Request, AssembleActor>();

/** Mark a request built on the server as made for `actor`. Returns the same request. */
export function actAs<R extends Request>(req: R, actor: AssembleActor): R {
  actors.set(req, actor);
  return req;
}

/** The actor a server-made request carries, or null for a request from a browser. */
export function actorOf(req: Request): AssembleActor | null {
  return actors.get(req) ?? null;
}
