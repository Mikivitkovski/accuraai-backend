import { writeFileSync } from "fs";
import { buildOpenApi } from "./schemas/authSchema";

const doc = buildOpenApi();
writeFileSync("openapi.json", JSON.stringify(doc, null, 2));
console.log("openapi.json written");
