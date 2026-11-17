import { greenhouse } from "./greenhouse";
import { lever } from "./lever";
import type { FeedConnector } from "./types";

/** Registered feed connectors. Add a provider here (and to job_feeds.provider's check). */
export const FEED_CONNECTORS: Record<FeedConnector["provider"], FeedConnector> = { greenhouse, lever };
export type { FeedConnector, NormalizedJob } from "./types";
