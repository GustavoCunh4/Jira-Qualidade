import { Badge } from "../ui";
import { getStatusTone } from "../../lib/status";

export default function StatusBadge({
  status,
  labels,
  className = "",
}: {
  status?: string | null;
  labels?: string[];
  className?: string;
}) {
  return (
    <Badge variant={getStatusTone(status, labels)} className={className}>
      {status || "Sem status"}
    </Badge>
  );
}
