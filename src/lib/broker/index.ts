// ─────────────────────────────────────────────────────────────────────────────
//  EOS Queue — Broker Factory
//  Decouples API code from the specific storage engine (Phase 1.1)
// ─────────────────────────────────────────────────────────────────────────────

import { MongoDBBroker } from "./mongobd-broker";
import type { IBroker } from "@/types";

function createBroker(): IBroker {
  const brokerType = process.env.BROKER_TYPE || "mongodb";

  switch (brokerType) {
    case "mongodb":
      return new MongoDBBroker();
    default:
      console.warn(`[Broker] Unknown broker type "${brokerType}", defaulting to MongoDB`);
      return new MongoDBBroker();
  }
}

// Singleton instance
export const broker: IBroker = createBroker();
export { MongoDBBroker };
export type { IBroker };