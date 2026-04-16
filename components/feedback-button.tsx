"use client";

import { useState } from "react";

type Category = "Bug" | "Idea" | "Other";

function SpeechBubbleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      {/* Bubble outline — open arc at bottom-right for the tail */}
      <path
        d="M17 10.5A7 7 0 1 1 3 10.5c0-3.866 3.134-7 7-7s7 3.134 7 7z"
        stroke="white"
        strokeWidth="1.5"
      />
      {/* Tail */}
      <path
        d="M13 15.5l2 3-4-1.5"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Three dots */}
      <circle cx="7.5" cy="10.5" r="1" fill="white" />
      <circle cx="10" cy="10.5" r="1" fill="white" />
      <circle cx="12.5" cy="10.5" r="1" fill="white" />
    </svg>
  );
}

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("Idea");
  const [comment, setComment] = useState("");
  function handleOpen() {
    setOpen(true);
    setComment("");
    setCategory("Idea");
  }

  function handleClose() {
    setOpen(false);
  }

  function handleSubmit() {
    if (!comment.trim()) return;
    setOpen(false);

    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category,
        comment,
        pageUrl: window.location.href,
      }),
    });
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={handleOpen}
        aria-label="Share feedback"
        className="fixed bottom-24 right-5 z-40 w-12 h-12 rounded-full flex items-center justify-center shadow-float transition-opacity active:opacity-70"
        style={{ backgroundColor: "#252729" }}
      >
        <SpeechBubbleIcon />
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center pb-28 px-5"
          style={{ backgroundColor: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }}
          onClick={handleClose}
        >
          <div
            className="w-full max-w-lg bg-white rounded-md p-6 shadow-float"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-light text-anthracite">Share feedback</h2>
              <button
                onClick={handleClose}
                className="w-7 h-7 flex items-center justify-center rounded-full transition-opacity active:opacity-70"
                style={{ backgroundColor: "#F3F3F4" }}
                aria-label="Close"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="#252729" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Category */}
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
                Category
              </p>
              <div className="flex gap-2">
                {(["Bug", "Idea", "Other"] as Category[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className="flex-1 py-2 rounded-full text-xs font-light transition-opacity active:opacity-70"
                    style={
                      category === c
                        ? { backgroundColor: "#252729", color: "#fff" }
                        : { backgroundColor: "#F3F3F4", color: "#474747" }
                    }
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Comment */}
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
                Your message
              </p>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Tell us what you think…"
                rows={4}
                className="w-full bg-surface-low rounded-md px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none resize-none"
              />
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!comment.trim()}
              style={{ backgroundColor: "#252729", color: "#fff" }}
              className="w-full py-3 rounded-full text-sm font-light transition-opacity disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}
