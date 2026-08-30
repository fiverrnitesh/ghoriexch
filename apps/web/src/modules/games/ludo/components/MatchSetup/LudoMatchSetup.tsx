import { useState, useEffect } from 'react';
import clsx from 'clsx';
import {
  DEFAULT_PLAYER_COUNT,
  type TPlayerCountNumber,
} from '../../config/matchConfig';
import {
  DEFAULT_STAKE_PRESETS,
  getSavedStakePresets,
  saveStakePresets,
  formatPresetLabel,
} from '../../../dice/components/DiceStakePresets';
import styles from './LudoMatchSetup.module.css';

type Props = {
  onStartMatch: (playerCount: TPlayerCountNumber, entryAmount: number) => void;
  onBack: () => void;
};

export function LudoMatchSetup({ onStartMatch, onBack }: Props) {
  const [selectedPlayerCount, setSelectedPlayerCount] =
    useState<TPlayerCountNumber>(DEFAULT_PLAYER_COUNT);
  const [amount, setAmount] = useState<number>(1000);
  const [amountInput, setAmountInput] = useState<string>('1000');
  const [presets, setPresets] = useState<number[]>(getSavedStakePresets);
  const [isEditingPresets, setIsEditingPresets] = useState<boolean>(false);
  const [editValues, setEditValues] = useState<string[]>([]);

  useEffect(() => {
    setPresets(getSavedStakePresets());
  }, []);

  const handleAddAmount = (inc: number) => {
    const next = (amount || 0) + inc;
    setAmount(next);
    setAmountInput(String(next));
  };

  const handleClear = () => {
    setAmount(0);
    setAmountInput('');
  };

  const handleAmountInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setAmountInput(val);
    const parsed = parseInt(val, 10);
    setAmount(Number.isFinite(parsed) && parsed >= 0 ? parsed : 0);
  };

  const startEditPresets = () => {
    setEditValues(presets.map(String));
    setIsEditingPresets(true);
  };

  const saveEditPresets = () => {
    const parsed = editValues.map((v, i) => {
      const num = parseFloat(v);
      return Number.isFinite(num) && num > 0 ? num : presets[i]!;
    });
    setPresets(parsed);
    saveStakePresets(parsed);
    setIsEditingPresets(false);
  };

  const resetPresetsToDefault = () => {
    setPresets([...DEFAULT_STAKE_PRESETS]);
    saveStakePresets([...DEFAULT_STAKE_PRESETS]);
    setIsEditingPresets(false);
  };

  const handleReset = () => {
    setSelectedPlayerCount(DEFAULT_PLAYER_COUNT);
    setAmount(1000);
    setAmountInput('1000');
  };

  const sumAmount = (amount || 0) * selectedPlayerCount;

  const handleSubmit = () => {
    if (!selectedPlayerCount || amount <= 0) return;
    onStartMatch(selectedPlayerCount, amount);
  };

  const formatNumber = (num: number) =>
    new Intl.NumberFormat('en-IN').format(num);

  return (
    <div className={styles.setupContainer}>
      <div className={styles.setupCard}>
        {/* Close Button */}
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onBack}
          aria-label="Close"
          title="Back to Lobby"
        >
          ✕
        </button>

        {/* Header matching Screenshot 2 */}
        <div className={styles.header}>
          <div className={styles.eyebrow}>
            <span>Ludo Match Setup</span>
            <span className={styles.coinBadge}>1 COIN = 1 PKR</span>
          </div>
          <h2 className={styles.title}>CHOOSE MATCH</h2>
        </div>

        {/* Choose Players */}
        <section className={styles.section}>
          <div className={styles.sectionLabel}>
            <span>CHOOSE PLAYERS</span>
          </div>
          <div className={styles.playerGrid}>
            {([2, 3, 4] as const).map((count) => {
              const isSelected = selectedPlayerCount === count;
              return (
                <button
                  key={count}
                  type="button"
                  className={clsx(styles.playerOption, { [styles.selected]: isSelected })}
                  onClick={() => setSelectedPlayerCount(count)}
                  aria-pressed={isSelected}
                >
                  <span className={styles.playerCountNum}>{count}</span>
                  <span className={styles.playerLabel}>Players</span>
                  <div className={styles.playerDots}>
                    <span className={clsx(styles.dot, styles.blue)} />
                    {count === 2 && <span className={clsx(styles.dot, styles.green)} />}
                    {count === 3 && (
                      <>
                        <span className={clsx(styles.dot, styles.red)} />
                        <span className={clsx(styles.dot, styles.green)} />
                      </>
                    )}
                    {count === 4 && (
                      <>
                        <span className={clsx(styles.dot, styles.red)} />
                        <span className={clsx(styles.dot, styles.green)} />
                        <span className={clsx(styles.dot, styles.yellow)} />
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Quick Stake Presets matching Screenshot 2 */}
        <section className={styles.stakePresetsContainer}>
          <div className={styles.stakePresetsHeader}>
            <span className={styles.stakePresetsTitle}>QUICK STAKE PRESETS</span>
            <div className={styles.stakePresetsActions}>
              {!isEditingPresets ? (
                <>
                  <button
                    type="button"
                    className={styles.editPresetsBtn}
                    onClick={startEditPresets}
                  >
                    Edit Presets
                  </button>
                  <button
                    type="button"
                    className={styles.clearLink}
                    onClick={handleClear}
                  >
                    Clear
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={styles.resetDefaultBtn}
                    onClick={resetPresetsToDefault}
                  >
                    Reset Default
                  </button>
                  <button
                    type="button"
                    className={styles.savePresetsBtn}
                    onClick={saveEditPresets}
                  >
                    Save
                  </button>
                </>
              )}
            </div>
          </div>

          <div className={styles.presetsGrid}>
            {!isEditingPresets
              ? presets.map((val, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={styles.presetBtn}
                    onClick={() => handleAddAmount(val)}
                    title={`+${val} Coins`}
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
                    className={styles.presetInput}
                    value={val}
                    onChange={(e) => {
                      const copy = [...editValues];
                      copy[idx] = e.target.value;
                      setEditValues(copy);
                    }}
                  />
                ))}
          </div>
        </section>

        {/* AMOUNT & SUM AMOUNT Dual Row matching Screenshot 2 */}
        <div className={styles.amountDualRow}>
          <div className={styles.amountCol}>
            <span className={styles.amountColLabel}>AMOUNT (COINS)</span>
            <input
              type="number"
              min="1"
              step="100"
              placeholder="0"
              className={styles.amountInput}
              value={amountInput}
              onChange={handleAmountInputChange}
            />
          </div>
          <div className={styles.amountCol}>
            <span className={styles.amountColLabel}>SUM AMOUNT (PRIZE POOL)</span>
            <div className={styles.amountBox}>
              {sumAmount > 0 ? `${formatNumber(sumAmount)} Coins` : '—'}
            </div>
          </div>
        </div>

        {/* Dual Actions matching Screenshot 2 (RESET / SUBMIT) */}
        <div className={styles.actions}>
          <button type="button" className={styles.resetBtn} onClick={handleReset}>
            RESET
          </button>
          <button
            type="button"
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={!selectedPlayerCount || amount <= 0}
          >
            SUBMIT
          </button>
        </div>
      </div>
    </div>
  );
}

export default LudoMatchSetup;
