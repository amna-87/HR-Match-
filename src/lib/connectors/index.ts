import { greenhouse } from "./greenhouse";
import { lever } from "./lever";
import { ashby } from "./ashby";
import { workable } from "./workable";
import { smartrecruiters } from "./smartrecruiters";
import { recruitee } from "./recruitee";
import type { FeedConnector } from "./types";

/** Registered feed connectors. Add a provider here (and to job_feeds.provider's check). */
export const FEED_CONNECTORS: Record<FeedConnector["provider"], FeedConnector> = {
  greenhouse,
  lever,
  ashby,
  workable,
  smartrecruiters,
  recruitee,
};
export type { FeedConnector, NormalizedJob } from "./types";
