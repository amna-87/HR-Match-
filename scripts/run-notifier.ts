// Send pending match notifications (respects throttling). Usage: DATABASE_URL=... npm run notify:run
import { getPool } from "../src/lib/db";
import { runNotifier } from "../src/lib/email/notifier";
import { getEmailSender } from "../src/lib/email/sender";

const pool = getPool();
runNotifier({ db: pool, sender: getEmailSender() })
  .then((r) => console.log(JSON.stringify(r, null, 2)))
  .finally(() => pool.end());
