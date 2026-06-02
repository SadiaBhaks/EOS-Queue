import { PostgreSQLBroker } from "./postgresql-broker";
import type { IBroker } from "@/types";

export const broker: IBroker = new PostgreSQLBroker();
export { PostgreSQLBroker };
export type { IBroker };