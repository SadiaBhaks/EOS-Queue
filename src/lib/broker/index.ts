import { PostgreSQLBroker } from "./postgree-broker";
import type { IBroker } from "@/types";

export const broker: IBroker = new PostgreSQLBroker();
export { PostgreSQLBroker };
export type { IBroker };