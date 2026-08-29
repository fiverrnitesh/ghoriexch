import { useState, useEffect } from 'react';
import './SideBetModals.css';

export const DEFAULT_STAKE_PRESETS = [
  1000, 2000, 5000, 10000, 20000,
  25000, 50000, 75000, 90000, 95000,
];

const PRESETS_STORAGE_KEY = 'ghori_dice_stake_presets';

export function getSavedStakePresets(): number[] {
  try {
    const saved = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length === 10 && parsed.every((n) => typeof n === 'number' && n > 0)) {
        return parsed;
      }
    }
  } catch {
    // fallback
  }
  return [...DEFAULT_STAKE_PRESETS];
}

export function saveStakePresets(presets: number[]) {
  try {
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // fallback
  }
}

export function formatPresetLabel(val: number): string {
  if (val >= 1000) {
    const k = val / 1000;
    return `+${k % 1 === 0 ? k : k.toFixed(1)}k`;
  }
  return `+${val}`;
}

interface DiceStakePresetsProps {
  onAddAmount: (increment: number) => void;
  onClear: () => void;
  currency?: string;
}

export function DiceStakePresets({ onAddAmount, onClear }: DiceStakePresetsProps) {
  const [presets, setPresets] = useState<number[]>(getSavedStakePresets);
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState<string[]>([]);

  useEffect(() => {
    setPresets(getSavedStakePresets());
  }, []);

  const startEdit = () => {
    setEditValues(presets.map(String));
    setIsEditing(true);
  };

  const saveEdit = () => {
    const parsed = editValues.map((v, i) => {
      const num = parseFloat(v);
      return Number.isFinite(num) && num > 0 ? num : presets[i]!;
    });
    setPresets(parsed);
    saveStakePresets(parsed);
    setIsEditing(false);
  };

  const resetToDefault = () => {
    setPresets([...DEFAULT_STAKE_PRESETS]);
    saveStakePresets([...DEFAULT_STAKE_PRESETS]);
    setIsEditing(false);
  };

  return (
    <div className="dice-stake-presets">
      <div className="dice-stake-presets__header">
        <span className="dice-stake-presets__title">QUICK STAKE PRESETS</span>
        <div className="dice-stake-presets__actions-top">
          {!isEditing ? (
            <>
              <button
                type="button"
                className="dice-stake-presets__edit-btn"
                onClick={startEdit}
              >
                Edit Presets
              </button>
              <button
                type="button"
                className="dice-stake-presets__clear-link"
                onClick={onClear}
              >
                Clear
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="dice-stake-presets__reset-btn"
                onClick={resetToDefault}
              >
                Reset Default
              </button>
              <button
                type="button"
                className="dice-stake-presets__save-btn"
                onClick={saveEdit}
              >
                Save
              </button>
            </>
          )}
        </div>
      </div>

      <div className="dice-stake-presets__grid">
        {!isEditing
          ? presets.map((val, idx) => (
              <button
                key={idx}
                type="button"
                className="dice-stake-preset-btn"
                onClick={() => onAddAmount(val)}
                title={`Add ${val}`}
              >
                {formatPresetLabel(val)}
              </button>
            ))
          : editValues.map((val, idx) => (
              <input
                key={idx}
                type="number"
                min="1"
                step="100"
                className="dice-stake-preset-input"
                value={val}
                onChange={(e) => {
                  const copy = [...editValues];
                  copy[idx] = e.target.value;
                  setEditValues(copy);
                }}
              />
            ))}
      </div>
    </div>
  );
}
