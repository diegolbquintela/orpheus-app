import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { SAVED_EMPTY, searchLine, type SavedSearch } from "@/lib/site/saved-searches";

/**
 * Saved searches (#80, spec §7b; ST4-19, ST4-20): the form's first control, closed by default; open, the last
 * five calculated searches, newest first, each with `Load`. No save button: desk.tsx saves after a successful
 * calculation. Storage is this browser's localStorage only (src/lib/site/saved-searches.ts).
 */
export function SavedSearches({
  list,
  onLoad,
}: {
  list: SavedSearch[];
  onLoad: (search: SavedSearch) => void;
}) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <div className="flex flex-col" data-testid="saved-searches">
      <button
        type="button"
        className="calc-saved-toggle self-start"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((v) => !v)}
        data-testid="saved-toggle"
      >
        Saved searches
        <ChevronDown
          className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div id={panel} className="mt-2" data-testid="saved-panel">
          {list.length ? (
            <ul className="flex flex-col">
              {list.map((search) => {
                const line = searchLine(search);
                return (
                  <li
                    key={line + search.capital + search.frequency}
                    className="calc-saved-line"
                    data-testid="saved-line"
                  >
                    <span className="min-w-0" data-testid="saved-text">
                      {/* Each part stays whole when the line wraps on a phone; the text is unchanged. */}
                      {line.split(" · ").map((part, at) => (
                        <span key={at}>
                          {at ? " · " : null}
                          <span className="whitespace-nowrap">{part}</span>
                        </span>
                      ))}
                    </span>
                    <button
                      type="button"
                      className="calc-saved-load"
                      aria-label={`Load ${line}`}
                      onClick={() => {
                        onLoad(search);
                        setOpen(false);
                      }}
                      data-testid="saved-load"
                    >
                      Load
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="calc-caption py-3" data-testid="saved-empty">
              {SAVED_EMPTY}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
