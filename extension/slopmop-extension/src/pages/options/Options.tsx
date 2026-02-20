import React from 'react';
import '@pages/options/Options.css';

export default function Options() {
  return (
    <div className="options-page">
      <header className="options-header">
        <h1 className="options-title">Options</h1>
      </header>
      <main className="options-main">
        {/* Settings content can go here */}
      </main>
      <div className="options-disclaimer">
        <p className="options-disclaimer__text">
          ℹ️ Detection results are probability-based estimates, not definitive determinations.
        </p>
      </div>
    </div>
  );
}
