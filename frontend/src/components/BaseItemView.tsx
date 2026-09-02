import type { BaseItem } from "../types";
import { GroupBlock } from "./GroupBlock";

function countLeaves(items: BaseItem[]): number {
  let n = 0;
  for (const item of items) {
    if (item.kind === "question") n += 1;
    else if (item.questions) n += countLeaves(item.questions);
  }
  return n;
}

export function hasPlaceholder(items: BaseItem[]): boolean {
  return items.some((item) => item.kind === "placeholder" || (item.questions && hasPlaceholder(item.questions)));
}

interface Props {
  items: BaseItem[];
  /** Rendered inline wherever the template's grp_form_content placeholder sits,
   * so this PDF's new content appears exactly where it will land at export. */
  renderPlaceholder?: () => React.ReactNode;
}

export function BaseItemView({ items, renderPlaceholder }: Props) {
  return (
    <>
      {items.map((item, i) => {
        if (item.kind === "placeholder") {
          return <div key={i}>{renderPlaceholder?.()}</div>;
        }
        if (item.kind === "group") {
          const count = countLeaves(item.questions ?? []);
          return (
            <GroupBlock key={i} label={item.label} locked defaultOpen={false} count={count}>
              <BaseItemView items={item.questions ?? []} renderPlaceholder={renderPlaceholder} />
            </GroupBlock>
          );
        }
        return (
          <div className="review-base-row" key={i}>
            <span className="text" style={{ flex: 1 }}>
              {item.label}
            </span>
            <span className="text-soft">{item.type}</span>
          </div>
        );
      })}
    </>
  );
}
