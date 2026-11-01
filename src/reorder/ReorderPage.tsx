import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  fetchReorderRecommendations,
  type ReorderRecommendation,
  type ReorderStatus,
} from "./reorder";
import "./ReorderPage.css";

const STATUS_ORDER: ReorderStatus[] = ["CRITICAL", "REORDER", "OK", "NO_DATA"];

const STATUS_LABEL: Record<ReorderStatus, string> = {
  CRITICAL: "Critical",
  REORDER: "Reorder",
  OK: "Healthy",
  NO_DATA: "No data",
};

const fmt = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 1 });

/**
 * Days of stock left, drawn against supplier lead time.
 * The tick marks the lead time: a bar that stops short of it means
 * the shelf empties before a new order could arrive.
 */
function CoverBar({
  cover,
  lead,
  status,
}: {
  cover: number | null;
  lead: number;
  status: ReorderStatus;
}) {
  if (cover === null) return <span className="muted">No sales yet</span>;

  const scale = lead * 3;
  const fill = Math.min(cover / scale, 1) * 100;
  const tick = (lead / scale) * 100;

  return (
    <div className="cover">
      <div
        className="cover-track"
        role="img"
        aria-label={`${fmt(cover)} days of stock left; supplier lead time is ${lead} days`}
      >
        <div className={`cover-fill s-${status}`} style={{ width: `${fill}%` }} />
        <div className="cover-tick" style={{ left: `${tick}%` }} />
      </div>
      <span className="cover-num">{fmt(cover)} d</span>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`chev ${open ? "is-open" : ""}`}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden="true"
    >
      <path
        d="M4.5 2.5 9 7l-4.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ReorderPage() {
  const [rows, setRows] = useState<ReorderRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ReorderStatus | "ALL">("ALL");
  const [warehouse, setWarehouse] = useState("ALL");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    fetchReorderRecommendations(controller.signal)
      .then((data) => setRows(data))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          e instanceof ApiError
            ? e.message
            : "Could not reach the server. Check your connection and try again.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [reloadKey]);

  const reload = () => {
    setLoading(true);
    setError(null);
    setReloadKey((k) => k + 1);
  };

  const counts = useMemo(() => {
    const c: Record<ReorderStatus, number> = {
      CRITICAL: 0,
      REORDER: 0,
      OK: 0,
      NO_DATA: 0,
    };
    rows.forEach((r) => {
      c[r.status] += 1;
    });
    return c;
  }, [rows]);

  const warehouses = useMemo(() => {
    const seen = new Map<number, string>();
    rows.forEach((r) => seen.set(r.warehouseId, r.warehouseName));
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (status === "ALL" || r.status === status) &&
        (warehouse === "ALL" || String(r.warehouseId) === warehouse) &&
        (q === "" || r.productName.toLowerCase().includes(q)),
    );
  }, [rows, status, warehouse, query]);

  const filtersActive = status !== "ALL" || warehouse !== "ALL" || query !== "";

  const clearFilters = () => {
    setStatus("ALL");
    setWarehouse("ALL");
    setQuery("");
  };

  const toggle = (id: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <main className="rp">
      <header className="rp-head">
        <div>
          <h1>Reorder recommendations</h1>
          <p className="rp-sub">
            {loading
              ? "Loading stock levels…"
              : `${rows.length} stock locations, based on recent sales and supplier lead times.`}
          </p>
        </div>
        <button type="button" className="rp-btn" onClick={reload} disabled={loading}>
          Refresh
        </button>
      </header>

      <div className="rp-chips" role="group" aria-label="Filter by status">
        <button
          type="button"
          className={`chip ${status === "ALL" ? "is-on" : ""}`}
          aria-pressed={status === "ALL"}
          onClick={() => setStatus("ALL")}
        >
          <b>{rows.length}</b> All
        </button>
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            className={`chip s-${s} ${status === s ? "is-on" : ""}`}
            aria-pressed={status === s}
            onClick={() => setStatus(status === s ? "ALL" : s)}
          >
            <b>{counts[s]}</b> {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="rp-tools">
        <label>
          <span className="sr">Search products</span>
          <input
            type="search"
            placeholder="Search products"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          <span className="sr">Warehouse</span>
          <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
            <option value="ALL">All warehouses</option>
            {warehouses.map(([id, name]) => (
              <option key={id} value={String(id)}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="rp-hint">
        The bar shows days of stock left. The tick marks supplier lead time: when the bar
        stops short of it, the shelf empties before a new order can arrive.
      </p>

      {error && (
        <div className="rp-panel rp-error" role="alert">
          <p>{error}</p>
          <button type="button" className="rp-btn" onClick={reload}>
            Try again
          </button>
        </div>
      )}

      {!error && (
        <div className="rp-table-wrap">
          <table className="rp-table">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">
                  In stock
                </th>
                <th scope="col">Days of cover</th>
                <th scope="col" className="num">
                  Reorder point
                </th>
                <th scope="col" className="num">
                  Order qty
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="rp-empty">
                    Loading…
                  </td>
                </tr>
              )}

              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="rp-empty">
                    {rows.length === 0 ? (
                      "No stock yet. Add inventory to a warehouse to see recommendations."
                    ) : (
                      <>
                        No stock locations match these filters.{" "}
                        {filtersActive && (
                          <button type="button" className="link" onClick={clearFilters}>
                            Clear filters
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              )}

              {!loading &&
                visible.map((r) => {
                  const isOpen = open.has(r.inventoryItemId);
                  const detailId = `detail-${r.inventoryItemId}`;
                  return (
                    <Fragment key={r.inventoryItemId}>
                      <tr className={isOpen ? "row is-open" : "row"}>
                        <td>
                          <button
                            type="button"
                            className="expander"
                            aria-expanded={isOpen}
                            aria-controls={detailId}
                            onClick={() => toggle(r.inventoryItemId)}
                          >
                            <Chevron open={isOpen} />
                            <span>
                              <span className="p-name">{r.productName}</span>
                              <span className="p-wh">{r.warehouseName}</span>
                            </span>
                          </button>
                        </td>
                        <td>
                          <span className={`badge s-${r.status}`}>
                            {STATUS_LABEL[r.status]}
                          </span>
                        </td>
                        <td className="num">{fmt(r.currentStock)}</td>
                        <td>
                          <CoverBar
                            cover={r.daysOfCover}
                            lead={r.leadTimeDays}
                            status={r.status}
                          />
                        </td>
                        <td className="num">
                          {r.status === "NO_DATA" ? (
                            <span className="muted">—</span>
                          ) : (
                            fmt(r.reorderPoint)
                          )}
                        </td>
                        <td className="num">
                          {r.suggestedOrderQty > 0 ? (
                            <strong>+{fmt(r.suggestedOrderQty)}</strong>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      </tr>

                      {isOpen && (
                        <tr id={detailId} className="detail">
                          <td colSpan={6}>
                            <p className="why">{r.explanation}</p>
                            {r.status !== "NO_DATA" && (
                              <dl className="facts">
                                <div>
                                  <dt>Average daily demand</dt>
                                  <dd>{fmt(r.avgDailyDemand)}</dd>
                                </div>
                                <div>
                                  <dt>Demand variability (σ)</dt>
                                  <dd>{fmt(r.demandStdDev)}</dd>
                                </div>
                                <div>
                                  <dt>Safety stock</dt>
                                  <dd>{fmt(r.safetyStock)}</dd>
                                </div>
                                <div>
                                  <dt>Supplier lead time</dt>
                                  <dd>{r.leadTimeDays} days</dd>
                                </div>
                                <div>
                                  <dt>Service level</dt>
                                  <dd>{Math.round(r.serviceLevel * 100)}%</dd>
                                </div>
                              </dl>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}