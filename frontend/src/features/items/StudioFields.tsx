export function FieldError({
  field,
  issues,
}: {
  field: string;
  issues?: { field: string; message: string }[];
}) {
  const issue = issues?.find(
    (i) =>
      i.field === field || (field === "basePriceMinor" && i.field === "price"),
  );
  return issue ? <small className="item-error">{issue.message}</small> : null;
}
