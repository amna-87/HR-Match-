import { greenhouse } from "./greenhouse";
import { lever } from "./lever";
import { ashby } from "./ashby";
import { workable } from "./workable";
import { smartrecruiters } from "./smartrecruiters";
import { recruitee } from "./recruitee";
import { remotive } from "./remotive";
import { remoteok } from "./remoteok";
import { arbeitnow } from "./arbeitnow";
import { jooble } from "./jooble";
import { careerjet } from "./careerjet";
import type { FeedConnector } from "./types";

/** Registered feed connectors. Add a provider here (and to job_feeds.provider's check). */
export const FEED_CONNECTORS: Record<FeedConnector["provider"], FeedConnector> = {
  greenhouse,
  lever,
  ashby,
  workable,
  smartrecruiters,
  recruitee,
  remotive,
  remoteok,
  arbeitnow,
  jooble,
  careerjet,
};

/** Search feeds that are switched on (keys present when required). */
export function availableSearchFeeds() {
  return Object.values(FEED_CONNECTORS).filter(
    (c) => c.kind === "search" && (!c.requiresEnv || !!process.env[c.requiresEnv]),
  );
}
export type { FeedConnector, NormalizedJob } from "./types";
