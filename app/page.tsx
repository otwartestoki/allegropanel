"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type ViewMode = "orders" | "payments";

type Order = {
  id: string;
  buyer_login: string | null;
  total_amount: number | null;
  currency: string | null;
  fulfillment_status: string | null;
  payment_operator: string | null;
  payment_kind: string | null;
  payment_status: string | null;
  seller_note: string | null;
  updated_at: string | null;
};

type BillingEntry = {
  id: string;
  occurred_at: string | null;
  type_id: string | null;
  type_name: string | null;
  amount: number | null;
  currency: string | null;
  direction: string | null;
  balance_amount: number | null;
  balance_currency: string | null;
  offer_id: string | null;
  offer_name: string | null;
  order_id: string | null;
};

type PaymentRow = BillingEntry & {
  source: "sale" | "billing";
};

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);

  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

function today() {
  const d = new Date();

  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

function formatMoney(value: number | null | undefined, currency = "PLN") {
  return `${Number(value ?? 0).toFixed(2)} ${currency}`;
}

export default function Home() {
  const [viewMode, setViewMode] = useState<ViewMode>("orders");

  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<BillingEntry[]>([]);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [dateFrom, setDateFrom] = useState(daysAgo(30));
  const [dateTo, setDateTo] = useState(today());
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [paymentTypeFilter, setPaymentTypeFilter] = useState("ALL");
  const [hideCodSales, setHideCodSales] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setErrorMessage("");

      const [ordersResult, paymentsResult] = await Promise.all([
        supabase
          .from("allegro_orders")
          .select(
            "id,buyer_login,total_amount,currency,fulfillment_status,payment_operator,payment_kind,payment_status,seller_note,updated_at"
          )
          .order("updated_at", { ascending: false })
          .limit(5000),

        supabase
          .from("allegro_billing_entries")
          .select(
            "id,occurred_at,type_id,type_name,amount,currency,direction,balance_amount,balance_currency,offer_id,offer_name,order_id"
          )
          .order("occurred_at", { ascending: false })
          .limit(5000),
      ]);

      if (ordersResult.error || paymentsResult.error) {
        console.error(ordersResult.error || paymentsResult.error);
        setErrorMessage(
          ordersResult.error?.message ||
            paymentsResult.error?.message ||
            "Błąd pobierania danych"
        );
        setOrders([]);
        setPayments([]);
      } else {
        setOrders((ordersResult.data ?? []) as Order[]);
        setPayments((paymentsResult.data ?? []) as BillingEntry[]);
      }

      setLoading(false);
    }

    loadData();
  }, []);

  const statuses = useMemo(() => {
    return Array.from(
      new Set(
        orders
          .map((o) => o.fulfillment_status)
          .filter((s): s is string => Boolean(s))
      )
    ).sort();
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (
        statusFilter !== "ALL" &&
        order.fulfillment_status !== statusFilter
      ) {
        return false;
      }

      if (dateFrom || dateTo) {
        if (!order.updated_at) return false;

        const orderDate = new Date(order.updated_at).getTime();

        if (dateFrom) {
          const from = new Date(`${dateFrom}T00:00:00`).getTime();
          if (orderDate < from) return false;
        }

        if (dateTo) {
          const to = new Date(`${dateTo}T23:59:59`).getTime();
          if (orderDate > to) return false;
        }
      }

      return true;
    });
  }, [orders, dateFrom, dateTo, statusFilter]);

  const ordersById = useMemo(() => {
    const result: Record<string, Order> = {};

    orders.forEach((order) => {
      result[order.id] = order;
    });

    return result;
  }, [orders]);

  const filteredBillingEntries = useMemo(() => {
    return payments.filter((payment) => {
      const paymentType = payment.type_name || payment.type_id || "";

      if (paymentTypeFilter !== "ALL" && paymentType !== paymentTypeFilter) {
        return false;
      }

      if (hideCodSales && payment.order_id) {
        const relatedOrder = ordersById[payment.order_id];

        if (relatedOrder?.payment_kind === "Pobranie") {
          return false;
        }
      }

      if (dateFrom || dateTo) {
        if (!payment.occurred_at) return false;

        const paymentDate = new Date(payment.occurred_at).getTime();

        if (dateFrom) {
          const from = new Date(`${dateFrom}T00:00:00`).getTime();
          if (paymentDate < from) return false;
        }

        if (dateTo) {
          const to = new Date(`${dateTo}T23:59:59`).getTime();
          if (paymentDate > to) return false;
        }
      }

      return true;
    });
  }, [payments, dateFrom, dateTo, paymentTypeFilter, hideCodSales, ordersById]);

  const salesAsPayments = useMemo<PaymentRow[]>(() => {
    return filteredOrders
      .filter((order) => order.fulfillment_status !== "Anulowane")
      .filter((order) => {
        if (!hideCodSales) return true;
        return order.payment_kind !== "Pobranie";
      })
      .map((order) => ({
        id: `sale-${order.id}`,
        occurred_at: order.updated_at,
        type_id: "SALE",
        type_name: "Wpływ ze sprzedaży",
        amount: Number(order.total_amount ?? 0),
        currency: order.currency ?? "PLN",
        direction: "plus",
        balance_amount: null,
        balance_currency: "PLN",
        offer_id: null,
        offer_name: order.buyer_login,
        order_id: order.id,
        source: "sale",
      }));
  }, [filteredOrders, hideCodSales]);

  const billingAsPayments = useMemo<PaymentRow[]>(() => {
    return filteredBillingEntries.map((payment) => ({
      ...payment,
      source: "billing",
    }));
  }, [filteredBillingEntries]);

  const allPayments = useMemo<PaymentRow[]>(() => {
    return [...salesAsPayments, ...billingAsPayments].sort((a, b) => {
      const dateA = a.occurred_at ? new Date(a.occurred_at).getTime() : 0;
      const dateB = b.occurred_at ? new Date(b.occurred_at).getTime() : 0;

      return dateB - dateA;
    });
  }, [salesAsPayments, billingAsPayments]);

  const paymentTypes = useMemo(() => {
    return Array.from(
      new Set(
        allPayments
          .map((p) => p.type_name || p.type_id)
          .filter((s): s is string => Boolean(s))
      )
    ).sort();
  }, [allPayments]);

  const activeOrders = filteredOrders.filter(
    (o) => o.fulfillment_status !== "Anulowane"
  );

  const totalSales = activeOrders.reduce(
    (sum, order) => sum + Number(order.total_amount ?? 0),
    0
  );

  const cancelledCount = filteredOrders.filter(
    (o) => o.fulfillment_status === "Anulowane"
  ).length;

  const paymentsPlus = allPayments
    .filter((p) => Number(p.amount ?? 0) > 0)
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

  const paymentsMinus = allPayments
    .filter((p) => Number(p.amount ?? 0) < 0)
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

  const paymentsNet = paymentsPlus + paymentsMinus;

  const sumsByPaymentKind = useMemo(() => {
    const result: Record<string, number> = {};

    activeOrders.forEach((order) => {
      const key = order.payment_kind || "Brak danych";
      result[key] = (result[key] || 0) + Number(order.total_amount ?? 0);
    });

    return result;
  }, [activeOrders]);

  const sumsByPaymentType = useMemo(() => {
    const result: Record<string, number> = {};

    allPayments.forEach((payment) => {
      const key = payment.type_name || payment.type_id || "Brak danych";
      result[key] = (result[key] || 0) + Number(payment.amount ?? 0);
    });

    return result;
  }, [allPayments]);

  function printSimpleList() {
    const rows =
      viewMode === "orders"
        ? filteredOrders
            .map(
              (order) => `
              <tr>
                <td>${order.buyer_login ?? ""}</td>
                <td>${formatMoney(order.total_amount, order.currency ?? "PLN")}</td>
                <td>${order.seller_note ?? ""}</td>
              </tr>
            `
            )
            .join("")
        : allPayments
            .map(
              (payment) => `
              <tr>
                <td>${
                  payment.occurred_at
                    ? new Date(payment.occurred_at).toLocaleString("pl-PL")
                    : ""
                }</td>
                <td>${payment.type_name ?? payment.type_id ?? ""}</td>
                <td>${payment.source === "sale" ? "Sprzedaż" : "Billing Allegro"}</td>
                <td>${formatMoney(payment.amount, payment.currency ?? "PLN")}</td>
              </tr>
            `
            )
            .join("");

    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      alert("Przeglądarka zablokowała okno wydruku. Zezwól na popupy.");
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Raport Allegro</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            h1 { font-size: 20px; margin-bottom: 8px; }
            p { font-size: 12px; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; vertical-align: top; }
            th { background: #eee; }
          </style>
        </head>
        <body>
          <h1>${
            viewMode === "orders"
              ? "Lista zamówień Allegro"
              : "Raport płatności Allegro"
          }</h1>
          <p>Zakres: ${dateFrom || "—"} do ${dateTo || "—"}</p>

          <table>
            <thead>
              ${
                viewMode === "orders"
                  ? `<tr><th>Użytkownik</th><th>Kwota</th><th>Notatka</th></tr>`
                  : `<tr><th>Data</th><th>Typ operacji</th><th>Źródło</th><th>Kwota</th></tr>`
              }
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>
    `);

    printWindow.document.close();

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 500);
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Panel Allegro
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Zamówienia: {orders.length} | Billing: {payments.length} |
              Aktualny widok:{" "}
              {viewMode === "orders"
                ? filteredOrders.length
                : allPayments.length}
            </p>

            {errorMessage && (
              <p className="mt-2 rounded-xl bg-red-100 p-3 text-sm text-red-700">
                Błąd Supabase: {errorMessage}
              </p>
            )}
          </div>

          <div className="flex rounded-2xl bg-white p-1 shadow">
            <button
              onClick={() => setViewMode("orders")}
              className={
                viewMode === "orders"
                  ? "rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
                  : "rounded-xl px-5 py-2 text-sm font-semibold text-slate-600"
              }
            >
              Zamówienia
            </button>

            <button
              onClick={() => setViewMode("payments")}
              className={
                viewMode === "payments"
                  ? "rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
                  : "rounded-xl px-5 py-2 text-sm font-semibold text-slate-600"
              }
            >
              Płatności
            </button>
          </div>
        </div>

        <div className="mb-6 grid gap-4 rounded-2xl bg-white p-4 shadow md:grid-cols-3">
          <div>
            <label className="block text-sm text-slate-600">Od</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-600">Do</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2"
            />
          </div>

          {viewMode === "orders" ? (
            <div>
              <label className="block text-sm text-slate-600">
                Status realizacji
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2"
              >
                <option value="ALL">Wszystkie</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-sm text-slate-600">
                Typ operacji
              </label>
              <select
                value={paymentTypeFilter}
                onChange={(e) => setPaymentTypeFilter(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2"
              >
                <option value="ALL">Wszystkie</option>
                {paymentTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>

              <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={hideCodSales}
                  onChange={(e) => setHideCodSales(e.target.checked)}
                  className="h-4 w-4"
                />
                Ukryj transakcje za pobraniem
              </label>
            </div>
          )}
        </div>

        {viewMode === "orders" ? (
          <>
            <section className="mb-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-white p-5 shadow">
                <div className="text-sm text-slate-500">Liczba zamówień</div>
                <div className="mt-2 text-3xl font-bold">
                  {filteredOrders.length}
                </div>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow">
                <div className="text-sm text-slate-500">
                  Sprzedaż bez anulowanych
                </div>
                <div className="mt-2 text-3xl font-bold">
                  {totalSales.toFixed(2)} PLN
                </div>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow">
                <div className="text-sm text-slate-500">Anulowane</div>
                <div className="mt-2 text-3xl font-bold">
                  {cancelledCount}
                </div>
              </div>
            </section>

            <section className="mb-6 rounded-2xl bg-white p-5 shadow">
              <h2 className="mb-4 text-lg font-semibold text-slate-900">
                Sumy wg typu płatności
              </h2>

              {Object.entries(sumsByPaymentKind).length === 0 ? (
                <div className="text-sm text-slate-500">Brak danych</div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(sumsByPaymentKind).map(([kind, sum]) => (
                    <div
                      key={kind}
                      className="flex justify-between border-b pb-2 text-sm"
                    >
                      <span>{kind}</span>
                      <strong>{sum.toFixed(2)} PLN</strong>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <>
            <section className="mb-6 grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl bg-white p-5 shadow">
                <div className="text-sm text-slate-500">Liczba operacji</div>
                <div className="mt-2 text-3xl font-bold">
                  {allPayments.length}
                </div>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow">
                <div className="text-sm text-slate-500">Plus</div>
                <div className="mt-2 text-3xl font-bold text-green-700">
                  {paymentsPlus.toFixed(2)} PLN
                </div>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow">
                <div className="text-sm text-slate-500">Minus</div>
                <div className="mt-2 text-3xl font-bold text-red-700">
                  {paymentsMinus.toFixed(2)} PLN
                </div>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow">
                <div className="text-sm text-slate-500">Netto</div>
                <div className="mt-2 text-3xl font-bold">
                  {paymentsNet.toFixed(2)} PLN
                </div>
              </div>
            </section>

            <section className="mb-6 rounded-2xl bg-white p-5 shadow">
              <h2 className="mb-4 text-lg font-semibold text-slate-900">
                Sumy wg typu operacji
              </h2>

              {Object.entries(sumsByPaymentType).length === 0 ? (
                <div className="text-sm text-slate-500">Brak danych</div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(sumsByPaymentType).map(([type, sum]) => (
                    <div
                      key={type}
                      className="flex justify-between border-b pb-2 text-sm"
                    >
                      <span>{type}</span>
                      <strong
                        className={
                          sum < 0 ? "text-red-700" : "text-green-700"
                        }
                      >
                        {sum.toFixed(2)} PLN
                      </strong>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        <section className="mb-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Wydruk
          </h2>

          <button
            onClick={printSimpleList}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900"
          >
            Drukuj aktualny widok
          </button>
        </section>

        <div className="overflow-x-auto rounded-2xl bg-white shadow">
          {viewMode === "orders" ? (
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-200 text-left">
                <tr>
                  <th className="p-3">Użytkownik</th>
                  <th className="p-3">Kwota</th>
                  <th className="p-3">Status realizacji</th>
                  <th className="p-3">Typ płatności</th>
                  <th className="p-3">Status płatności</th>
                  <th className="p-3">Operator</th>
                  <th className="p-3">Notatka</th>
                  <th className="p-3">Aktualizacja</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="p-4 text-slate-500">
                      Ładowanie danych...
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-4 text-slate-500">
                      Brak danych.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => (
                    <tr key={order.id} className="border-t">
                      <td className="p-3">{order.buyer_login}</td>
                      <td className="p-3">
                        {formatMoney(
                          order.total_amount,
                          order.currency ?? "PLN"
                        )}
                      </td>
                      <td className="p-3">
                        <span
                          className={
                            order.fulfillment_status === "Anulowane"
                              ? "rounded-full bg-red-100 px-3 py-1 text-red-700"
                              : "rounded-full bg-green-100 px-3 py-1 text-green-700"
                          }
                        >
                          {order.fulfillment_status || "Brak statusu"}
                        </span>
                      </td>
                      <td className="p-3">{order.payment_kind}</td>
                      <td className="p-3">{order.payment_status}</td>
                      <td className="p-3">{order.payment_operator}</td>
                      <td className="p-3">{order.seller_note}</td>
                      <td className="p-3">
                        {order.updated_at
                          ? new Date(order.updated_at).toLocaleString("pl-PL")
                          : ""}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-200 text-left">
                <tr>
                  <th className="p-3">Data</th>
                  <th className="p-3">Źródło</th>
                  <th className="p-3">Typ operacji</th>
                  <th className="p-3">Kwota</th>
                  <th className="p-3">Kierunek</th>
                  <th className="p-3">Saldo</th>
                  <th className="p-3">Oferta / kupujący</th>
                  <th className="p-3">Zamówienie</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="p-4 text-slate-500">
                      Ładowanie danych...
                    </td>
                  </tr>
                ) : allPayments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-4 text-slate-500">
                      Brak danych.
                    </td>
                  </tr>
                ) : (
                  allPayments.map((payment) => (
                    <tr key={payment.id} className="border-t">
                      <td className="p-3">
                        {payment.occurred_at
                          ? new Date(payment.occurred_at).toLocaleString(
                              "pl-PL"
                            )
                          : ""}
                      </td>

                      <td className="p-3">
                        <span
                          className={
                            payment.source === "sale"
                              ? "rounded-full bg-green-100 px-3 py-1 text-green-700"
                              : "rounded-full bg-slate-100 px-3 py-1 text-slate-700"
                          }
                        >
                          {payment.source === "sale"
                            ? "Sprzedaż"
                            : "Billing Allegro"}
                        </span>
                      </td>

                      <td className="p-3">
                        {payment.type_name || payment.type_id || "Brak danych"}
                      </td>

                      <td
                        className={
                          Number(payment.amount ?? 0) < 0
                            ? "p-3 font-semibold text-red-700"
                            : "p-3 font-semibold text-green-700"
                        }
                      >
                        {formatMoney(payment.amount, payment.currency ?? "PLN")}
                      </td>

                      <td className="p-3">
                        <span
                          className={
                            Number(payment.amount ?? 0) < 0
                              ? "rounded-full bg-red-100 px-3 py-1 text-red-700"
                              : "rounded-full bg-green-100 px-3 py-1 text-green-700"
                          }
                        >
                          {payment.direction || "brak"}
                        </span>
                      </td>

                      <td className="p-3">
                        {payment.balance_amount !== null
                          ? formatMoney(
                              payment.balance_amount,
                              payment.balance_currency ?? "PLN"
                            )
                          : "—"}
                      </td>

                      <td className="p-3">
                        <div>{payment.offer_id || "—"}</div>
                        <div className="text-xs text-slate-500">
                          {payment.offer_name}
                        </div>
                      </td>

                      <td className="p-3">{payment.order_id || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}