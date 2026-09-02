import type { BaseItem } from "../types";
import "./BaseItemView.css";

function countLeaves(items: BaseItem[]): number {
  let n = 0;
  for (const item of items) {
    if (item.kind === "question") n += 1;
    else if (item.questions) n += countLeaves(item.questions);
  }
  return n;
}

export function countBaseItems(items: BaseItem[]): number {
  return countLeaves(items);
}

export function BaseItemView({ items }: { items: BaseItem[] }) {
  return (
    <div className="base-item-list">
      {items.map((item, i) =>
        item.kind === "group" ? (
          <div className="base-group" key={i}>
            <div className="base-group-header label">{item.label}</div>
            <BaseItemView items={item.questions ?? []} />
          </div>
        ) : (
          <div className="review-base-row" key={i}>
            <span className="text" style={{ flex: 1 }}>
              {item.label}
            </span>
            <span className="text-soft">{item.type}</span>
          </div>
        ),
      )}
    </div>
  );
}
