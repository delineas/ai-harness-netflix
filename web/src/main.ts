import "./style.css";
import { formatHours, formatNumber, formatWeeks } from "./format.ts";

type Card = { kind: "movie" | "show"; id: number; title: string; year: number | null; hoursViewed: number; weeksInTop10: number };
type Detail = Card & { seasons: { id: number; title: string; seasonNumber: number | null; hoursViewed: number }[] };
type Review = { id: number; author: string; rating: number; body: string };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const state = { page: 1, totalPages: 1, selected: null as { kind: string; id: number } | null };

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

async function loadStats() {
  try {
    const s = await get<{ movies: number; shows: number; hoursViewed: number }>("/api/stats");
    $("stats").textContent = `${formatNumber(s.movies)} movies · ${formatNumber(s.shows)} shows · ${formatHours(s.hoursViewed)} viewed`;
  } catch {
    $("stats").textContent = "Stats unavailable.";
  }
}

async function loadTitles() {
  const params = new URLSearchParams({
    q: $<HTMLInputElement>("q").value,
    kind: $<HTMLSelectElement>("kind").value,
    sort: $<HTMLSelectElement>("sort").value,
    page: String(state.page),
  });
  const grid = $("grid");
  const msg = $("message");
  try {
    const data = await get<{ items: Card[]; total: number; page: number; pageSize: number }>(`/api/titles?${params}`);
    state.totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
    grid.replaceChildren(
      ...data.items.map((t) => {
        const b = el(
          "button",
          { type: "button", className: "card" },
          el("strong", { className: "card-title" }, t.title),
          el("span", { className: "meta" }, `${t.kind === "movie" ? "Movie" : "Show"}${t.year ? " · " + t.year : ""}`),
          el("span", {}, `${formatHours(t.hoursViewed)} viewed`),
          el("span", {}, `${formatWeeks(t.weeksInTop10)} in top 10`),
        );
        b.addEventListener("click", () => openDetail(t.kind, t.id));
        return el("li", {}, b);
      }),
    );
    msg.textContent = data.items.length ? "" : "No titles match your search.";
    $("page-info").textContent = `Page ${state.page} of ${state.totalPages}`;
  } catch (e) {
    grid.replaceChildren();
    msg.textContent = `Could not load titles. ${(e as Error).message}`;
  }
  $<HTMLButtonElement>("prev").disabled = state.page <= 1;
  $<HTMLButtonElement>("next").disabled = state.page >= state.totalPages;
}

async function openDetail(kind: string, id: number) {
  state.selected = { kind, id };
  const panel = $("detail");
  try {
    const [d, reviews, users] = await Promise.all([
      get<Detail>(`/api/titles/${kind}/${id}`),
      get<Review[]>(`/api/titles/${kind}/${id}/reviews`),
      get<{ id: number; name: string }[]>("/api/users"),
    ]);
    const section = el("section", { className: "detail" });
    section.setAttribute("aria-label", d.title);
    section.append(el("h2", {}, d.title));
    const facts = el("dl");
    const fact = (k: string, v: string) => facts.append(el("dt", {}, k), el("dd", {}, v));
    fact("Kind", d.kind === "movie" ? "Movie" : "Show");
    fact("Release year", d.year ? String(d.year) : "Unknown");
    fact("Hours viewed", formatHours(d.hoursViewed));
    fact("Weeks in top 10", String(d.weeksInTop10));
    section.append(facts);
    if (d.kind === "show") {
      section.append(
        el("h3", {}, "Seasons"),
        el("ul", {}, ...d.seasons.map((s) => el("li", {}, `${s.title}: ${formatHours(s.hoursViewed)}`))),
      );
    }
    section.append(el("h3", {}, "Reviews"));
    section.append(
      reviews.length
        ? el(
            "ul",
            { className: "reviews" },
            ...reviews.map((r) =>
              el("li", {}, el("strong", {}, r.author), ` ${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}`, el("p", {}, r.body)),
            ),
          )
        : el("p", {}, "No reviews yet."),
    );

    const form = el("form", { className: "review-form" });
    const user = el("select", { name: "user", required: true }, ...users.map((u) => el("option", { value: String(u.id) }, u.name)));
    const rating = el("select", { name: "rating" }, ...[5, 4, 3, 2, 1].map((n) => el("option", { value: String(n) }, String(n))));
    const body = el("textarea", { name: "body", required: true, rows: 3 });
    const status = el("p", { role: "status" });
    form.append(
      el("h3", {}, "Write a review"),
      el("label", {}, "User ", user),
      el("label", {}, "Rating ", rating),
      el("label", {}, "Review ", body),
      el("button", { type: "submit" }, "Send review"),
      status,
    );
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        const res = await fetch(`/api/titles/${kind}/${id}/reviews`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: Number(user.value), rating: Number(rating.value), body: body.value }),
        });
        if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Error");
        status.textContent = "Thanks! Your review is waiting for moderation.";
        body.value = "";
      } catch (e) {
        status.textContent = `Could not send the review. ${(e as Error).message}`;
      }
    });
    section.append(form);
    panel.replaceChildren(section);
    panel.classList.add("open");
  } catch (e) {
    panel.replaceChildren(el("p", { role: "alert" }, `Could not load the detail. ${(e as Error).message}`));
  }
}

$("search-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  state.page = 1;
  loadTitles();
});
$("prev").addEventListener("click", () => {
  if (state.page > 1) {
    state.page--;
    loadTitles();
  }
});
$("next").addEventListener("click", () => {
  if (state.page < state.totalPages) {
    state.page++;
    loadTitles();
  }
});

loadStats();
loadTitles();
