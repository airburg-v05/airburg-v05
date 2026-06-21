import { matchField } from "@/lib/metrics/field-map";

export const testMapping = (headers: string[]) => {
  const result = matchField(headers);
  console.log("Field mapping result:", result);
  return result;
};
