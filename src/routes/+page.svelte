<script>
  import { analyzeStream } from '$lib/api.js';
  import { onMount } from 'svelte';

  onMount(() => {
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  });

  // ===== Presets =====
  const presets = [
    {
      icon: '🚰',
      label: '茶水間相遇',
      sub: '不熟同事沉默對峙',
      text: '我去茶水間裝水，結果遇到一個不太熟的同事也在裝水，雙方都沉默，不知道要不要說話。',
    },
    {
      icon: '🛗',
      label: '電梯密室',
      sub: '兩人密閉空間困境',
      text: '我和一個同事一起進電梯，只有我們兩個人，要搭很久，不知道要看哪裡。',
    },
    {
      icon: '💼',
      label: '會議前空白期',
      sub: '等待開會的尷尬五分鐘',
      text: '我開會提早到，會議室只有我和一個不熟的同事，還有五分鐘才開始，不知道要聊天還是假裝看資料。社交能量大概 50。',
    },
    {
      icon: '🧧',
      label: '親戚審訊',
      sub: '過年被問薪水感情結婚',
      text: '過年家族聚餐，親戚問我薪水多少、有沒有對象、什麼時候結婚，我不想回答但又不能太失禮。',
    },
    {
      icon: '🍽️',
      label: '聚餐陌生人鄰座',
      sub: '餐桌社交持久戰',
      text: '公司聚餐，我被安排坐在一個幾乎不認識的同事旁邊，吃飯要吃很久，話題一直乾掉又不能一直滑手機。',
    },
    {
      icon: '💻',
      label: '線上會議被點名',
      sub: '沒在聽突然被問意見',
      text: '線上會議突然被主管點名，問我剛剛討論那個方案我的看法，但我剛才沒在聽。',
    },
    {
      icon: '🏠',
      label: '姻親獨處',
      sub: '跟另一半家人尬聊',
      text: '我跟伴侶的家人獨處，只有我和他的姐姐在客廳，兩個人都不知道要聊什麼，氣氛很尷尬。',
    },
    {
      icon: '🚿',
      label: '廁所遇到主管',
      sub: '最不適合社交的場域',
      text: '我在廁所洗手台，結果主管也進來了，兩個人一起洗手，我不知道要不要打招呼還是假裝沒看到。',
    },
  ];

  // ===== State =====
  let situation = $state('');
  let loading = $state(false);
  let loadingStage = $state(0);
  /** @type {any} */
  let result = $state(null);
  let error = $state('');
  let analyzedSituation = $state('');
  let expanded = $state(false);
  /** @type {null|'open'|'buffer'|'exit'} */
  let usedScript = $state(null);

  const LOADING_STAGES = [
    '正在評估情境架構…',
    '計算社交風險與能量消耗…',
    '生成應對策略矩陣…',
    '模擬對方可能反應…',
  ];
  const LOADING_IMAGES = [
    '/phase1.png',
    '/phase2.png',
    '/phase3.png',
    '/phase4.png',
  ];

  // ===== Derived =====
  let level = $derived(result?.level ?? 0);
  let themeClass = $derived(level >= 1 && level <= 5 ? `theme-lv${level}` : '');
  let charCount = $derived(situation.length);

  // ===== Actions =====
  function usePreset(text) {
    situation = text;
    error = '';
  }

  function newAnalysis() {
    result = null;
    situation = '';
    error = '';
    analyzedSituation = '';
    expanded = false;
    usedScript = null;
  }

  // ===== Quick actions =====
  const quickActions = [
    { type: 'igone',    icon: '🚨', label: '啟動 I-GONE',  prompt: '請立即啟動 I-GONE 一鍵逃生卡，幫我撤離。' },
    { type: 'escalate', icon: '⬆',  label: '對方繼續問',   prompt: '對方繼續追問，情況升級，請啟動失控偵測並更新建議。' },
    { type: 'redirect', icon: '↩',  label: '反問轉移',     prompt: '請啟動反問轉移器，幫我把話題轉移給對方。' },
    { type: 'polite',   icon: '🎩', label: '給我更禮貌',   prompt: '請用更禮貌、更正式的方式重新給話術建議。' },
    { type: 'casual',   icon: '😑', label: '給我更敷衍',   prompt: '請用更簡短敷衍但仍保持基本禮貌的方式重新給話術建議。' },
    { type: 'report',   icon: '🏁', label: '任務結算',     prompt: '互動已結束，請產生 I-GONE 任務結算報告。' },
  ];

  function _startStream(text, onSuccess, expand = false) {
    error = '';
    loading = true;
    loadingStage = 0;
    result = null;

    // Queue incoming stages so each image shows for at least 2 s
    const MIN_MS = 1000;
    let stageQueue = [];
    let lastStagedAt = Date.now();
    let drainTimer = null;

    function _applyNextStage() {
      if (stageQueue.length === 0) { drainTimer = null; return; }
      const next = stageQueue.shift();
      loadingStage = next;
      lastStagedAt = Date.now();
      drainTimer = setTimeout(_applyNextStage, MIN_MS);
    }

    function _queueStage(idx) {
      if (idx <= loadingStage && stageQueue.length === 0) return;
      stageQueue.push(idx);
      if (!drainTimer) {
        const elapsed = Date.now() - lastStagedAt;
        const wait = Math.max(0, MIN_MS - elapsed);
        drainTimer = setTimeout(_applyNextStage, wait);
      }
    }

    analyzeStream(
      text,
      (stage) => {
        const idx = LOADING_STAGES.indexOf(stage);
        if (idx > loadingStage || stageQueue.length > 0) _queueStage(idx);
      },
      (res) => {
        // Flush remaining stages before showing result, each for MIN_MS.
        // Also respect the remaining display time of the currently-shown stage.
        if (drainTimer) { clearTimeout(drainTimer); drainTimer = null; }
        const flush = () => {
          if (stageQueue.length > 0) {
            loadingStage = stageQueue.shift();
            lastStagedAt = Date.now();
            setTimeout(flush, MIN_MS);
          } else {
            // Wait out whatever is left of the current stage's 2 s slot
            const remaining = Math.max(0, MIN_MS - (Date.now() - lastStagedAt));
            setTimeout(() => {
              result = res;
              onSuccess();
              loading = false;
              loadingStage = 0;
            }, remaining);
          }
        };
        flush();
      },
      (msg) => {
        if (drainTimer) { clearTimeout(drainTimer); drainTimer = null; }
        error = msg || '分析失敗，請稍後再試。';
        loading = false;
        loadingStage = 0;
      },
      expand,
    );
  }

  function handleQuickAction(prompt) {
    const full = `【原始情境】${analyzedSituation}\n\n${prompt}`;
    expanded = true;
    _startStream(full, () => { analyzedSituation = full; }, true);
  }

  function handleScriptSelect(script, label, type) {
    usedScript = type;
    const prompt = `我剛才對對方說了「${script}」（${label}話術）。請模擬對方接下來最可能的回應，根據這個新局面重新評估風險，並給出完全不同於之前的三組新話術建議（script_open / script_buffer / script_exit 都必須是新內容，不可與剛才用過的「${script}」相同或相似）。`;
    const full = `【原始情境】${analyzedSituation}\n\n${prompt}`;
    expanded = true;
    _startStream(full, () => { analyzedSituation = full; }, true);
  }

  function handleAnalyze() {
    if (!situation.trim()) {
      error = '請先描述你的情境，或點選上方預設情境。';
      return;
    }
    const text = situation;
    analyzedSituation = text;
    expanded = false;
    _startStream(text, () => {}, false);
  }

  function onKeydown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleAnalyze();
    }
  }

  // ===== Helpers =====
  function strategyIcon(s = '') {
    if (s.includes('完全迴避')) return '🫥';
    if (s.includes('最低社交')) return '🤝';
    if (s.includes('控制型')) return '🎯';
    if (s.includes('反問轉移')) return '↩️';
    if (s.includes('GONE') || s.includes('撤離')) return '🚀';
    return '📋';
  }

  function modeIcon(m = '') {
    if (m.includes('親戚防禦')) return '🛡️';
    if (m.includes('會議生存')) return '💼';
    if (m.includes('E人模擬')) return '⚡';
    if (m.includes('I-GONE') || m.includes('撤離')) return '🚨';
    if (m.includes('社交合規')) return '✅';
    return '🧊';
  }

  const levelLabels = ['', '低風險', '輕微尷尬', '中度尷尬', '高風險', '社交地獄'];

  // ===== Auto-scroll to result =====
  let resultCardEl = $state(null);
  $effect(() => {
    if (result && resultCardEl) {
      requestAnimationFrame(() => resultCardEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    }
  });
</script>

<div class="app {themeClass}">
  <div class="container">

    <!-- Header -->
    <header>
      <div class="header-logo-side">
        <img src="/igone_logo.png" alt="I-GONE Logo" class="site-logo" />
      </div>
      <div class="header-copy-side">
        <p class="tagline">I 人社交地獄逃生系統</p>
        <p class="tagline-sub">Social Escape Risk Management</p>
        <div class="beliefs">
          <span class="belief-tag">不是逃避，是風險控管</span>
          <span class="belief-tag">不是失禮，是最低社交合規</span>
          <span class="belief-tag">社交不是目的，活著離開才是</span>
        </div>
      </div>
    </header>

    <main>
      <div class="workspace">

        <!-- LEFT: Presets (top) + Input (bottom) -->
        <div class="panel-left">

          <div class="presets-section">
            <div class="card presets-card">
              <div class="card-title">預設情境</div>
              <div class="presets-grid">
                {#each presets as p}
                  <button
                    class="preset-btn"
                    class:active={situation === p.text}
                    onclick={() => usePreset(p.text)}
                  >
                    <span class="preset-icon">{p.icon}</span>
                    <span class="preset-info">
                      <span class="preset-label">{p.label}</span>
                      <span class="preset-sub">{p.sub}</span>
                    </span>
                  </button>
                {/each}
              </div>
            </div>
          </div>

          <div class="input-section">
            <div class="card input-card">
              <div class="card-title">描述情境 · 啟動分析</div>
              <textarea
                bind:value={situation}
                placeholder="描述你目前遇到的社交情境……&#10;例如：我在茶水間裝水遇到主管，他開始問我最近工作進度……"
                rows="4"
              ></textarea>
              <div class="input-actions">
                <span class="char-count">{charCount} 字　·　⌘↩ 快速送出</span>
                <button class="btn-analyze" onclick={handleAnalyze} disabled={loading}>
                  <span class="btn-icon">⚡</span>
                  {loading ? '分析中…' : '啟動逃生分析'}
                </button>
              </div>
              {#if error}
                <div class="error-block">{error}</div>
              {/if}
            </div>
          </div>

        </div><!-- /panel-left -->

        <!-- RIGHT: Dashboard + Results -->
        <div class="panel-right" class:no-scroll={!result}>

          {#if !result && !loading}
            <div class="empty-state">
              <img src="/igone_logo.png" alt="I-GONE" class="empty-logo" />
              <div class="empty-title">I-GONE 待機中</div>
              <div class="empty-sub">選擇預設情境或輸入描述，啟動社交風險分析</div>
            </div>
          {/if}

          {#if loading}
            <div class="card loading-card">
              <img
                src={LOADING_IMAGES[loadingStage]}
                alt={LOADING_STAGES[loadingStage]}
                class="loading-phase-img"
              />
              <div class="loading-text">I-GONE 系統分析中</div>
              <div class="loading-stage">{LOADING_STAGES[loadingStage]}</div>
              <div class="loading-progress">
                {#each LOADING_STAGES as _, i}
                  <div class="loading-dot {i <= loadingStage ? 'active' : ''}"></div>
                {/each}
              </div>
            </div>
          {/if}

          {#if result}

            <!-- RISK DASHBOARD -->
            <div class="card dashboard-card" bind:this={resultCardEl}>
              <div class="dashboard-header">
                <div class="dash-title-row">
                  <span class="dash-title-text">⟨ 風險儀表板 ⟩</span>
                  {#if result.mode}
                    <span class="mode-badge">
                      <span>{modeIcon(result.mode)}</span>
                      <span>{result.mode}</span>
                    </span>
                  {/if}
                </div>
                {#if result.state_current}
                  <div class="state-flow-inline">
                    <span class="state-node prev">{result.state_prev ?? '—'}</span>
                    <span class="state-arrow">→</span>
                    <span class="state-node current">{result.state_current}</span>
                    {#if result.state_verdict}
                      <span class="state-verdict-inline">{result.state_verdict}</span>
                    {/if}
                  </div>
                {/if}
              </div>

              <!-- Level gauge -->
              <div class="dash-level-row">
                <span class="dash-bar-label">社交地獄等級</span>
                <div class="level-gauge">
                  {#each Array(5) as _, i}
                    <div class="gauge-pip" class:active={i < result.level}></div>
                  {/each}
                </div>
                <span class="dash-level-val">Lv.{result.level} <span class="dash-level-sub">{levelLabels[result.level] ?? ''}</span></span>
              </div>

              <!-- Metric bars -->
              <div class="dash-bars">
                <div class="dash-bar-row">
                  <span class="dash-bar-label">尷尬指數</span>
                  <div class="dash-bar-track">
                    <div class="dash-bar-fill risk" style="width:{result.awkward_percent}%"></div>
                  </div>
                  <span class="dash-bar-val">{result.awkward_percent}%</span>
                </div>
                {#if result.risk_convo_extend != null}
                  <div class="dash-bar-row">
                    <span class="dash-bar-label">對話延伸風險</span>
                    <div class="dash-bar-track">
                      <div class="dash-bar-fill risk" style="width:{result.risk_convo_extend}%"></div>
                    </div>
                    <span class="dash-bar-val">{result.risk_convo_extend}%</span>
                  </div>
                {/if}
                {#if result.risk_forced_chat != null}
                  <div class="dash-bar-row">
                    <span class="dash-bar-label">被迫聊天風險</span>
                    <div class="dash-bar-track">
                      <div class="dash-bar-fill risk" style="width:{result.risk_forced_chat}%"></div>
                    </div>
                    <span class="dash-bar-val">{result.risk_forced_chat}%</span>
                  </div>
                {/if}
                {#if result.risk_exit_feasibility != null}
                  <div class="dash-bar-row">
                    <span class="dash-bar-label">撤離可行性</span>
                    <div class="dash-bar-track">
                      <div class="dash-bar-fill safe" style="width:{result.risk_exit_feasibility}%"></div>
                    </div>
                    <span class="dash-bar-val safe-val">{result.risk_exit_feasibility}%</span>
                  </div>
                {/if}
                <div class="dash-bar-row">
                  <span class="dash-bar-label">社交能量消耗</span>
                  <div class="dash-energy-track">
                    <div class="dash-energy-before" style="width:{result.social_energy_before ?? 60}%"></div>
                    <div class="dash-energy-after" style="width:{result.social_energy_after ?? 50}%"></div>
                  </div>
                  <span class="dash-bar-val">
                    <span class="energy-consume-tag">−{result.social_energy_consume}</span>
                    <span class="energy-remaining-tag">{result.social_energy_after}/100</span>
                  </span>
                </div>
              </div>

              {#if result.system_verdict}
                <div class="dash-verdict">{result.system_verdict}</div>
              {/if}
            </div>

            <!-- RESPONSE SCRIPT CARDS -->
            {#if result.script_open || result.script_buffer || result.script_exit}
              <div class="script-cards-section">
                <div class="script-section-label">選擇回應話術 · 點選後模擬對方反應</div>
                <div class="script-cards-grid">
                  {#if result.script_open && usedScript !== 'open'}
                    <button class="script-card script-open" onclick={() => handleScriptSelect(result.script_open, '開場', 'open')} disabled={loading}>
                      <span class="script-card-tag">開場話術</span>
                      <span class="script-card-text">「{result.script_open}」</span>
                      <span class="script-card-cta">模擬對方反應 →</span>
                    </button>
                  {/if}
                  {#if result.script_buffer && usedScript !== 'buffer'}
                    <button class="script-card script-buffer" onclick={() => handleScriptSelect(result.script_buffer, '緩衝', 'buffer')} disabled={loading}>
                      <span class="script-card-tag">緩衝話術</span>
                      <span class="script-card-text">「{result.script_buffer}」</span>
                      <span class="script-card-cta">模擬對方反應 →</span>
                    </button>
                  {/if}
                  {#if result.script_exit && usedScript !== 'exit'}
                    <button class="script-card script-exit" onclick={() => handleScriptSelect(result.script_exit, '收尾', 'exit')} disabled={loading}>
                      <span class="script-card-tag">收尾話術</span>
                      <span class="script-card-text">「{result.script_exit}」</span>
                      <span class="script-card-cta">模擬對方反應 →</span>
                    </button>
                  {/if}
                </div>
              </div>
            {/if}

            <!-- STRATEGY + ACTIONS -->
            <div class="card actions-card">
              <div class="actions-card-header">
                <span class="actions-card-label">建議行動</span>
                <span class="strategy-badge">
                  <span>{strategyIcon(result.strategy)}</span>
                  <span>{result.strategy}</span>
                </span>
              </div>
              {#if result.actions?.length}
                <ul class="action-list-hero">
                  {#each result.actions as action, i}
                    <li>
                      <span class="action-num">{i + 1}</span>
                      <span>{action}</span>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>

            <!-- Expand button (quick mode only — shown until user triggers full analysis) -->
            {#if !expanded && !loading}
              <button
                class="btn-expand"
                onclick={() => { expanded = true; _startStream(analyzedSituation, () => {}, true); }}
                disabled={loading}
              >
                <span>展開完整分析</span>
                <span class="expand-hint">▾ 策略比較 · 對方反應模擬</span>
              </button>
            {/if}

            <!-- Situation snapshot -->
            <div class="result-block">
              <div class="block-label">情境快照</div>
              <div class="block-content">{result.situation}</div>
            </div>

            <!-- Strategy comparison table -->
            {#if result.strategy_table?.length}
              <div class="result-block">
                <div class="block-label">策略比較</div>
                <div class="strategy-table-wrap">
                  <table class="strategy-table">
                    <thead>
                      <tr>
                        <th>策略</th>
                        <th>尷尬降低</th>
                        <th>禮貌合規</th>
                        <th>能量消耗</th>
                        <th>延伸風險</th>
                        <th>建議</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each result.strategy_table as row}
                        <tr class:recommended={row.recommend === '推薦'}>
                          <td class="st-name">{row.name}</td>
                          <td>{row.awkward_reduce}%</td>
                          <td>{row.politeness}%</td>
                          <td>-{row.energy_cost}</td>
                          <td>{row.extend_risk}%</td>
                          <td>
                            <span class="recommend-badge recommend-{row.recommend === '推薦' ? 'yes' : row.recommend === '可接受' ? 'ok' : 'no'}">
                              {row.recommend}
                            </span>
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              </div>
            {/if}

            <!-- Reaction simulation -->
            {#if result.reactions?.length}
              <div class="result-block">
                <div class="block-label">對方反應模擬</div>
                <div class="reactions-list">
                  {#each result.reactions as r}
                    <div class="reaction-item">
                      <div class="reaction-header">
                        <span class="reaction-risk risk-{r.risk === '低' ? 'low' : r.risk === '中' ? 'mid' : 'high'}">風險 {r.risk}</span>
                        <span class="reaction-line">「{r.line}」</span>
                      </div>
                      <div class="reaction-response">
                        <span class="reaction-response-prefix">建議應對</span>
                        <span>{r.response}</span>
                      </div>
                    </div>
                  {/each}
                  {#if result.reaction_fallback}
                    <div class="reaction-fallback">
                      <span class="reaction-response-prefix">Fallback</span>
                      <span>「{result.reaction_fallback}」</span>
                    </div>
                  {/if}
                </div>
              </div>
            {/if}

            <!-- Risk Warning -->
            {#if result.risk_warning}
              <div class="result-block">
                <div class="block-label">⚠ 風險提醒</div>
                <div class="block-content">{result.risk_warning}</div>
              </div>
            {/if}

            <!-- I-GONE card -->
            {#if result.igone_card}
              {@const card = result.igone_card}
              <div class="special-section igone-card-section">
                <div class="special-title">【I-GONE 一鍵逃生卡】</div>
                <div class="igone-exit-verdict">{card.exit_verdict}</div>
                {#if card.route}
                  <div class="igone-route">
                    <span class="special-tag">路線</span>
                    <span class="igone-route-text">{card.route}</span>
                  </div>
                {/if}
                <div class="igone-two-col">
                  {#if card.min_politeness?.length}
                    <div>
                      <div class="special-label">最低禮貌動作</div>
                      <ul class="action-list">
                        {#each card.min_politeness as p}<li>{p}</li>{/each}
                      </ul>
                    </div>
                  {/if}
                  {#if card.countdown?.length}
                    <div>
                      <div class="special-label">撤離倒數</div>
                      <div class="igone-countdown">
                        {#each card.countdown as step}
                          <div class="countdown-step">{step}</div>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
                {#if card.escape_line}
                  <div class="special-label">逃生話術</div>
                  <div class="talk-bubble igone-escape"><span class="quote-icon">"</span><span class="safe-exit-text">{card.escape_line}</span></div>
                {/if}
                {#if card.backup_line}
                  <div class="talk-bubble" style="margin-top:6px"><span class="quote-icon">"</span><span>{card.backup_line}</span></div>
                {/if}
                {#if card.risk_reminder}
                  <div class="igone-risk-reminder">⚠ {card.risk_reminder}</div>
                {/if}
                {#if card.card_note}
                  <div class="system-note" style="margin-top:12px;margin-bottom:0">
                    <span class="system-note-icon">◉</span>
                    <span>{card.card_note}</span>
                  </div>
                {/if}
              </div>
            {:else if result.igone_reason}
              <div class="result-block" class:highlight={result.igone_recommended}>
                <div class="block-label">{result.igone_recommended ? '🚨 建議啟動 I-GONE' : '✅ 暫不需要 I-GONE'}</div>
                <div class="block-content">{result.igone_reason}</div>
              </div>
            {/if}

            <!-- Counter-question redirector -->
            {#if result.counter_question}
              {@const cq = result.counter_question}
              <div class="special-section counter-section">
                <div class="special-title">【反問轉移器啟動】</div>
                <div class="special-row">
                  <span class="special-tag">問題類型</span>
                  <span>{cq.question_type}</span>
                </div>
                <div class="special-row">
                  <span class="special-tag">不建議直答原因</span>
                  <span>{cq.no_answer_reason}</span>
                </div>
                {#if cq.safe_responses?.length}
                  <div class="special-label">安全回應</div>
                  <div class="talk-list">
                    {#each cq.safe_responses as r}
                      <div class="talk-bubble"><span class="quote-icon">"</span><span>{r}</span></div>
                    {/each}
                  </div>
                {/if}
                {#if cq.redirect_questions?.length}
                  <div class="special-label">反問轉移</div>
                  <div class="talk-list">
                    {#each cq.redirect_questions as q}
                      <div class="talk-bubble redirect"><span class="redirect-icon">↩</span><span>{q}</span></div>
                    {/each}
                  </div>
                {/if}
                {#if cq.safe_exit}
                  <div class="special-label">安全收尾</div>
                  <div class="talk-bubble"><span class="quote-icon">"</span><span class="safe-exit-text">{cq.safe_exit}</span></div>
                {/if}
              </div>
            {/if}

            <!-- Escalation detection -->
            {#if result.escalation}
              {@const esc = result.escalation}
              <div class="special-section escalation-section">
                <div class="special-title">【失控偵測】</div>
                <div class="escalation-header">
                  <span class="special-tag">{esc.event_type}</span>
                  <span class="level-jump">Lv.{esc.level_before} → Lv.{esc.level_after}</span>
                </div>
                <div class="block-content" style="margin:8px 0">{esc.verdict}</div>
                {#if esc.actions?.length}
                  <div class="special-label">立即建議</div>
                  <ul class="action-list">
                    {#each esc.actions as a}<li>{a}</li>{/each}
                  </ul>
                {/if}
                {#if esc.emergency_scripts?.length}
                  <div class="special-label">緊急話術</div>
                  <div class="talk-list">
                    {#each esc.emergency_scripts as s}
                      <div class="talk-bubble emergency"><span class="quote-icon">"</span><span>{s}</span></div>
                    {/each}
                  </div>
                {/if}
                <div class="igone-trigger-row" class:triggered={esc.igone_trigger}>
                  {esc.igone_trigger ? '🚨 系統判定：立即啟動 I-GONE 撤離模式' : '⚠ 尚未達到 I-GONE 啟動門檻，繼續監控中'}
                </div>
              </div>
            {/if}

            <!-- Mission report -->
            {#if result.mission_report}
              {@const mr = result.mission_report}
              <div class="special-section mission-section">
                <div class="special-title">【I-GONE 任務結算報告】</div>
                <div class="mission-header">
                  <div class="mission-name">{mr.name}</div>
                  <div class="mission-result">{mr.result}</div>
                </div>
                <div class="mission-energy-row">
                  <span class="energy-tag before">原始 {mr.energy_before}</span>
                  <span class="energy-consume">−{mr.energy_consume}</span>
                  <span class="energy-tag after">剩餘 {mr.energy_after}</span>
                  <span class="mission-max-level">最高 Lv.{mr.max_level}</span>
                </div>
                <div class="score-grid">
                  <div class="score-item">
                    <div class="score-val">{mr.score_politeness}%</div>
                    <div class="score-label">禮貌合規</div>
                    <div class="score-bar-bg"><div class="score-bar-fill" style="width:{mr.score_politeness}%"></div></div>
                  </div>
                  <div class="score-item">
                    <div class="score-val">{mr.score_control}%</div>
                    <div class="score-label">對話控制</div>
                    <div class="score-bar-bg"><div class="score-bar-fill" style="width:{mr.score_control}%"></div></div>
                  </div>
                  <div class="score-item">
                    <div class="score-val">{mr.score_exit_timing}%</div>
                    <div class="score-label">撤離時機</div>
                    <div class="score-bar-bg"><div class="score-bar-fill" style="width:{mr.score_exit_timing}%"></div></div>
                  </div>
                  <div class="score-item">
                    <div class="score-val">{mr.score_awkward_absorption}%</div>
                    <div class="score-label">尷尬吸收</div>
                    <div class="score-bar-bg"><div class="score-bar-fill" style="width:{mr.score_awkward_absorption}%"></div></div>
                  </div>
                </div>
                {#if mr.successes?.length}
                  <div class="special-label">成功之處</div>
                  <ul class="action-list">
                    {#each mr.successes as s}<li>{s}</li>{/each}
                  </ul>
                {/if}
                {#if mr.improvements?.length}
                  <div class="special-label">可改進之處</div>
                  <ul class="action-list improvement">
                    {#each mr.improvements as imp}<li>{imp}</li>{/each}
                  </ul>
                {/if}
                {#if mr.next_suggestion}
                  <div class="special-label">下次建議</div>
                  <div class="block-content">{mr.next_suggestion}</div>
                {/if}
                {#if mr.system_comment}
                  <div class="system-note" style="margin-top:12px">
                    <span class="system-note-icon">◉</span>
                    <span>系統評語：{mr.system_comment}</span>
                  </div>
                {/if}
              </div>
            {/if}

            <!-- System Note -->
            {#if result.system_note}
              <div class="system-note">
                <span class="system-note-icon">◉</span>
                <span>系統備註：{result.system_note}</span>
              </div>
            {/if}

            <!-- Quick actions -->
            {#if !result.mission_report}
              <div class="quick-actions">
                <div class="quick-actions-label">快捷指令</div>
                <div class="quick-btns">
                  {#each quickActions as qa}
                    <button
                      class="btn-quick qa-{qa.type}"
                      onclick={() => handleQuickAction(qa.prompt)}
                      disabled={loading}
                    >
                      <span class="qa-icon">{qa.icon}</span>
                      <span>{qa.label}</span>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}

            <button class="btn-new" onclick={newAnalysis}>↺ 分析新情境</button>

          {/if}<!-- /result -->

        </div><!-- /panel-right -->
      </div><!-- /workspace -->
    </main>


  </div>
</div>

<style>
  /* ===== CSS Variables - Morandi Base ===== */
  .app {
    --bg-primary:    #EDE8E3;
    --bg-secondary:  #E0DAD3;
    --bg-card:       #F5F2EE;
    --border:        #CFC9C2;
    --text-primary:  #3D3830;
    --text-secondary:#7A7268;
    --text-muted:    #A89F95;
    --accent:        #8B9E8B;
    --accent-light:  #B5C4B1;
    --accent-dim:    rgba(139,158,139,0.15);
    --badge-bg:      #8B9E8B;
    --badge-text:    #F5F2EE;
    --input-bg:      #FAFAF8;
    --shadow:        rgba(61,56,48,0.08);
    --shadow-md:     rgba(61,56,48,0.14);
    --transition:    0.6s cubic-bezier(0.4,0,0.2,1);

    height: 100vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background-color: var(--bg-primary);
    color: var(--text-primary);
    font-family: 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif;
    line-height: 1.7;
    transition: background-color var(--transition), color var(--transition);
  }

  /* ===== Risk Level Themes ===== */
  .app.theme-lv1 {
    --bg-primary:  #E8EDE6; --bg-secondary: #DAE2D8; --bg-card: #F2F6F1;
    --border:      #C4D0C2; --accent: #7A9E7A; --accent-light: #A8C4A6;
    --accent-dim:  rgba(122,158,122,0.15); --badge-bg: #7A9E7A;
  }
  .app.theme-lv2 {
    --bg-primary:  #E3E8EE; --bg-secondary: #D4DCE6; --bg-card: #F0F4F8;
    --border:      #B8C8D8; --accent: #6B8FA8; --accent-light: #96B4CA;
    --accent-dim:  rgba(107,143,168,0.15); --badge-bg: #6B8FA8;
  }
  .app.theme-lv3 {
    --bg-primary:  #EDE8E0; --bg-secondary: #E4DCCF; --bg-card: #F6F3ED;
    --border:      #D4C8B4; --accent: #B09A76; --accent-light: #CDB898;
    --accent-dim:  rgba(176,154,118,0.15); --badge-bg: #B09A76;
  }
  .app.theme-lv4 {
    --bg-primary:  #EDE3E0; --bg-secondary: #E4D6D1; --bg-card: #F6F1EF;
    --border:      #D4BEB8; --accent: #B07A6E; --accent-light: #CC9C92;
    --accent-dim:  rgba(176,122,110,0.15); --badge-bg: #B07A6E;
  }
  .app.theme-lv5 {
    --bg-primary:  #EDE0DF; --bg-secondary: #E4D0CF; --bg-card: #F6EFEE;
    --border:      #D4B4B2; --accent: #A85A58; --accent-light: #C47876;
    --accent-dim:  rgba(168,90,88,0.15); --badge-bg: #A85A58;
  }

  /* ===== Layout ===== */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .container {
    max-width: 1280px;
    width: 100%;
    margin: 0 auto;
    padding: 0 12px;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  /* ===== Header ===== */
  header {
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 20px;
    transition: border-color var(--transition);
  }
  .header-logo-side {
    flex-shrink: 0;
  }
  .site-logo {
    height: 110px;
    width: auto;
    display: block;
    object-fit: contain;
    filter: drop-shadow(0 2px 8px rgba(0,0,0,0.12));
  }
  .header-copy-side {
    flex: 1;
    min-width: 0;
  }
  .tagline {
    font-size: 18px;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.01em;
    margin-bottom: 2px;
    transition: color var(--transition);
  }
  .tagline-sub {
    font-size: 11px;
    color: var(--text-muted);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 10px;
    transition: color var(--transition);
  }
  .beliefs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .belief-tag {
    font-size: 11px;
    color: var(--text-muted);
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 100px;
    padding: 3px 12px;
    transition: background var(--transition), border-color var(--transition), color var(--transition);
  }

  /* ===== Main ===== */
  main {
    flex: 1;
    min-height: 0;
    padding: 20px 0 0;
    display: flex;
    flex-direction: column;
  }

  /* ===== Two-column workspace ===== */
  .workspace {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    flex: 1;
    min-height: 0;
  }

  .panel-left {
    display: flex;
    flex-direction: column;
    min-height: 0;
    gap: 16px;
  }

  .presets-section {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .input-section { flex-shrink: 0; }
  .input-card { margin-bottom: 0 !important; }

  .presets-card {
    margin-bottom: 0;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .presets-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  .panel-right {
    min-width: 0;
    overflow-y: auto;
    padding-right: 4px;
    padding-bottom: 20px;
    min-height: 0;
  }
  .panel-right.no-scroll {
    overflow: hidden;
    padding-bottom: 0;
    display: flex;
    flex-direction: column;
  }
  .panel-right.no-scroll .empty-state,
  .panel-right.no-scroll .loading-card {
    flex: 1;
    min-height: 0;
    margin-bottom: 0;
  }

  /* ===== Card ===== */
  .card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 28px;
    margin-bottom: 20px;
    box-shadow: 0 2px 12px var(--shadow);
    transition: background var(--transition), border-color var(--transition), box-shadow var(--transition);
  }
  .card-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: color var(--transition);
  }
  .card-title::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
    transition: background var(--transition);
  }

  /* ===== Presets ===== */
  .presets-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    /* overflow-y handled by layout */
  }
  .preset-btn {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 12px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 14px;
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: border-color 0.2s, background var(--transition);
    font-family: inherit;
  }
  .preset-btn:hover {
    border-color: var(--accent);
    background: var(--accent-dim);
  }
  .preset-btn.active {
    border-color: var(--accent);
    background: var(--accent-dim);
    box-shadow: inset 2px 0 0 var(--accent);
  }
  .preset-icon { font-size: 18px; flex-shrink: 0; }
  .preset-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .preset-label {
    font-size: 13px; font-weight: 600;
    color: var(--text-primary);
    transition: color var(--transition);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .preset-sub {
    font-size: 11px;
    color: var(--text-muted);
    transition: color var(--transition);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ===== Textarea ===== */
  textarea {
    width: 100%;
    padding: 16px;
    font-size: 14px;
    line-height: 1.7;
    font-family: inherit;
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    color: var(--text-primary);
    resize: vertical;
    outline: none;
    transition: border-color 0.2s, background 0.2s;
  }
  textarea:focus { border-color: var(--accent); }
  textarea::placeholder { color: var(--text-muted); }

  .input-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 12px;
    gap: 12px;
  }
  .char-count {
    font-size: 11px;
    color: var(--text-muted);
    transition: color var(--transition);
  }
  .btn-analyze {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--accent);
    color: var(--badge-text);
    border: none;
    border-radius: 10px;
    padding: 12px 28px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    letter-spacing: 0.04em;
    font-family: inherit;
    transition: background var(--transition), opacity 0.2s, transform 0.1s;
  }
  .btn-analyze:hover:not(:disabled) { opacity: 0.85; transform: translateY(-1px); }
  .btn-analyze:active:not(:disabled) { transform: translateY(0); }
  .btn-analyze:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-icon { font-size: 16px; }

  /* ===== Error ===== */
  .error-block {
    margin-top: 12px;
    background: rgba(168,90,88,0.1);
    border: 1px solid #A85A58;
    border-radius: 10px;
    padding: 12px 16px;
    font-size: 13px;
    color: #8B3A38;
  }

  /* ===== Loading ===== */
  .loading-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 20px 16px;
    text-align: center;
    height: 100%;
    box-sizing: border-box;
  }
  .loading-phase-img {
    width: min(520px, 96%);
    max-height: 72vh;
    height: auto;
    object-fit: contain;
    filter: drop-shadow(0 4px 18px rgba(0,0,0,0.12));
    animation: phase-breathe 1.8s ease-in-out infinite;
  }
  @keyframes phase-breathe {
    0%, 100% { opacity: 0.82; transform: scale(1); }
    50%       { opacity: 1;    transform: scale(1.04); }
  }
  .loading-text {
    font-size: 13px; color: var(--text-secondary); font-weight: 600;
    transition: color var(--transition);
  }
  .loading-stage {
    font-size: 12px; color: var(--text-muted);
    min-height: 18px;
    transition: color var(--transition);
  }
  .loading-progress {
    display: flex; gap: 6px; align-items: center;
  }
  .loading-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--border);
    transition: background 0.3s;
  }
  .loading-dot.active { background: var(--accent); }

  /* ===== Result ===== */
  .result-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
    flex-wrap: wrap;
    gap: 10px;
  }
  .result-header-right {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .result-title {
    font-size: 13px; font-weight: 700;
    letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--accent); transition: color var(--transition);
  }
  .risk-badge { display: flex; align-items: center; gap: 10px; }
  .level-indicator { display: flex; gap: 4px; }
  .level-dot {
    width: 10px; height: 10px;
    border-radius: 50%;
    background: var(--border);
    transition: background var(--transition);
  }
  .level-dot.active { background: var(--accent); }
  .level-label {
    font-size: 12px; color: var(--text-muted);
    transition: color var(--transition);
  }

  /* ===== Hero action zone ===== */
  .action-hero {
    background: var(--accent-dim);
    border: 1.5px solid var(--accent);
    border-radius: 14px;
    padding: 20px 22px;
    margin-bottom: 14px;
    transition: background var(--transition), border-color var(--transition);
  }
  .action-hero-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 16px;
  }
  .action-hero-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--accent);
    transition: color var(--transition);
  }
  .action-list-hero {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 16px;
  }
  .action-list-hero li {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    font-size: 15px;
    font-weight: 500;
    color: var(--text-primary);
    line-height: 1.6;
    transition: color var(--transition);
  }
  .action-num {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--badge-text);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    margin-top: 2px;
    transition: background var(--transition);
  }
  .scripts-strip {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .script-chip {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    transition: background var(--transition), border-color var(--transition);
  }
  .script-chip.exit {
    border-color: var(--accent);
    background: var(--bg-secondary);
  }
  .chip-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-muted);
    transition: color var(--transition);
  }
  .script-chip.exit .chip-label { color: var(--accent); }
  .chip-text {
    font-size: 13px;
    color: var(--text-primary);
    line-height: 1.5;
    transition: color var(--transition);
  }
  .script-chip.exit .chip-text { font-weight: 600; }

  /* ===== Compact metrics strip ===== */
  .metrics-strip {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 10px 16px;
    margin-bottom: 14px;
    transition: background var(--transition), border-color var(--transition);
  }
  .metric-sep {
    color: var(--border);
    font-size: 16px;
    flex-shrink: 0;
    transition: color var(--transition);
  }
  .metric-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .metric-pill-val {
    font-size: 17px;
    font-weight: 700;
    color: var(--accent);
    line-height: 1;
    transition: color var(--transition);
  }
  .metric-pill-lbl {
    font-size: 11px;
    color: var(--text-muted);
    transition: color var(--transition);
  }
  .metric-pill-unit {
    font-size: 11px;
    color: var(--text-muted);
    font-weight: 400;
  }
  .metric-mini-bar {
    width: 44px;
    height: 5px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
    transition: background var(--transition);
  }
  .metric-mini-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 3px;
    transition: width 0.8s ease, background var(--transition);
  }
  .energy-mini-track {
    position: relative;
    width: 52px;
    height: 5px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
    transition: background var(--transition);
  }
  .energy-mini-before {
    position: absolute;
    height: 100%;
    background: var(--accent-light);
    border-radius: 3px;
    transition: width 0.8s ease, background var(--transition);
  }
  .energy-mini-after {
    position: absolute;
    height: 100%;
    background: var(--accent);
    border-radius: 3px;
    transition: width 0.8s ease, background var(--transition);
  }

  /* Result blocks */
  .result-block {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px 20px;
    margin-bottom: 12px;
    transition: background var(--transition), border-color var(--transition);
  }
  .result-block.highlight {
    background: var(--accent-dim);
    border-color: var(--accent);
    border-left: 3px solid var(--accent);
  }
  .block-label {
    font-size: 10px; font-weight: 700;
    letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--text-muted); margin-bottom: 8px;
    transition: color var(--transition);
  }
  .block-content {
    font-size: 14px; color: var(--text-primary);
    line-height: 1.7; transition: color var(--transition);
  }

  /* Strategy badge */
  .strategy-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--badge-bg);
    color: var(--badge-text);
    border-radius: 100px;
    padding: 6px 16px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    transition: background var(--transition);
  }

  /* Action list */
  .action-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 4px;
    padding: 0;
  }
  .action-list li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 14px;
    color: var(--text-primary);
    transition: color var(--transition);
  }
  .action-list li::before {
    content: '→';
    color: var(--accent);
    font-weight: 700;
    flex-shrink: 0;
    margin-top: 1px;
    transition: color var(--transition);
  }

  /* Talk bubbles */
  .talk-list { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
  .talk-bubble {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 14px;
    color: var(--text-primary);
    display: flex;
    align-items: flex-start;
    gap: 8px;
    transition: background var(--transition), border-color var(--transition), color var(--transition);
  }
  .talk-bubble.borderless {
    background: transparent; border: none; padding: 4px 0;
  }
  .quote-icon {
    color: var(--accent); font-size: 18px;
    line-height: 1; flex-shrink: 0;
    transition: color var(--transition);
  }
  .safe-exit-text { font-weight: 600; }

  /* System note */
  .system-note {
    background: var(--accent-dim);
    border: 1px solid var(--accent);
    border-radius: 12px;
    padding: 14px 18px;
    font-size: 12px;
    color: var(--text-secondary);
    font-style: italic;
    display: flex;
    gap: 10px;
    align-items: flex-start;
    margin-bottom: 16px;
    transition: background var(--transition), border-color var(--transition), color var(--transition);
  }
  .system-note-icon {
    color: var(--accent); font-size: 14px;
    flex-shrink: 0; margin-top: 1px;
    transition: color var(--transition);
  }

  /* New analysis button */
  .btn-new {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 13px;
    background: none;
    border: 1px dashed var(--border);
    border-radius: 12px;
    font-size: 13px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
    font-family: inherit;
  }
  .btn-new:hover {
    background: var(--bg-secondary);
    border-color: var(--accent);
    color: var(--accent);
  }


  /* ===== Mode badge (in header) ===== */
  .mode-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 100px;
    padding: 4px 12px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
    letter-spacing: 0.04em;
    white-space: nowrap;
    transition: background var(--transition), border-color var(--transition), color var(--transition);
  }

  /* ===== Energy tags (used in mission report) ===== */
  .energy-tag {
    padding: 2px 10px;
    border-radius: 100px;
    font-weight: 600;
    font-size: 11px;
  }
  .energy-tag.before {
    background: var(--accent-dim);
    color: var(--text-secondary);
  }
  .energy-tag.after {
    background: var(--accent);
    color: var(--badge-text);
  }
  .energy-consume {
    color: #A85A58;
    font-weight: 700;
    font-size: 12px;
  }

  /* ===== Talk bubble variants ===== */
  .talk-bubble.redirect {
    background: rgba(107,143,168,0.08);
    border-color: rgba(107,143,168,0.3);
  }
  .redirect-icon { color: #6B8FA8; font-size: 14px; flex-shrink: 0; margin-top: 1px; }
  .talk-bubble.emergency {
    background: rgba(168,90,88,0.08);
    border-color: rgba(168,90,88,0.3);
  }
  .talk-bubble.emergency .quote-icon { color: #A85A58; }

  /* ===== Special sections ===== */
  .special-section {
    border-radius: 14px;
    padding: 20px;
    margin-bottom: 12px;
    border: 1px solid var(--border);
  }
  .counter-section {
    background: rgba(107,143,168,0.07);
    border-color: rgba(107,143,168,0.3);
  }
  .escalation-section {
    background: rgba(168,90,88,0.06);
    border-color: rgba(168,90,88,0.3);
  }
  .mission-section {
    background: var(--accent-dim);
    border-color: var(--accent);
  }
  .special-title {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--accent);
    margin-bottom: 14px;
    transition: color var(--transition);
  }
  .counter-section .special-title { color: #4A7A98; }
  .escalation-section .special-title { color: #A85A58; }
  .special-row {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 10px;
    font-size: 13px;
    color: var(--text-primary);
    flex-wrap: wrap;
  }
  .special-tag {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 100px;
    padding: 2px 10px;
    transition: background var(--transition), border-color var(--transition);
  }
  .special-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin: 12px 0 6px;
    transition: color var(--transition);
  }

  /* Escalation */
  .escalation-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 6px;
    flex-wrap: wrap;
  }
  .level-jump {
    font-size: 13px;
    font-weight: 700;
    color: #A85A58;
    background: rgba(168,90,88,0.1);
    border-radius: 100px;
    padding: 3px 12px;
  }
  .igone-trigger-row {
    margin-top: 14px;
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 600;
    background: rgba(61,56,48,0.06);
    color: var(--text-secondary);
    border: 1px solid var(--border);
    transition: background var(--transition), border-color var(--transition);
  }
  .igone-trigger-row.triggered {
    background: rgba(168,90,88,0.12);
    border-color: rgba(168,90,88,0.4);
    color: #A85A58;
  }

  /* Mission report */
  .mission-header { margin-bottom: 12px; }
  .mission-name {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 4px;
    transition: color var(--transition);
  }
  .mission-result {
    font-size: 12px;
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-dim);
    border: 1px solid var(--accent);
    border-radius: 100px;
    display: inline-block;
    padding: 3px 14px;
    transition: background var(--transition), border-color var(--transition), color var(--transition);
  }
  .mission-energy-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .mission-max-level {
    margin-left: auto;
    font-size: 11px;
    font-weight: 700;
    color: var(--text-muted);
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 100px;
    padding: 2px 10px;
    transition: background var(--transition), border-color var(--transition);
  }
  .score-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin-bottom: 14px;
  }
  .score-item {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 12px;
    transition: background var(--transition), border-color var(--transition);
  }
  .score-val {
    font-size: 20px;
    font-weight: 700;
    color: var(--accent);
    transition: color var(--transition);
  }
  .score-label {
    font-size: 10px;
    color: var(--text-muted);
    margin: 2px 0 6px;
    letter-spacing: 0.06em;
    transition: color var(--transition);
  }
  .score-bar-bg {
    height: 4px;
    background: var(--border);
    border-radius: 2px;
    overflow: hidden;
    transition: background var(--transition);
  }
  .score-bar-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 2px;
    transition: width 0.8s ease, background var(--transition);
  }
  .action-list.improvement li::before { content: '△'; color: #B09A76; }

  /* ===== Quick actions ===== */
  .quick-actions {
    border-top: 1px dashed var(--border);
    padding-top: 16px;
    margin-bottom: 12px;
    transition: border-color var(--transition);
  }
  .quick-actions-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 10px;
    transition: color var(--transition);
  }
  .quick-btns {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .btn-quick {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 9px 10px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    border: 1px solid var(--border);
    background: var(--bg-secondary);
    color: var(--text-secondary);
    transition: all 0.18s;
    white-space: nowrap;
  }
  .btn-quick:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-quick:not(:disabled):hover { transform: translateY(-1px); }
  .qa-icon { font-size: 14px; flex-shrink: 0; }
  /* Per-type accent colours on hover */
  .btn-quick.qa-igone:not(:disabled):hover    { background: rgba(168,90,88,0.12); border-color: rgba(168,90,88,0.5); color: #A85A58; }
  .btn-quick.qa-escalate:not(:disabled):hover { background: rgba(176,122,110,0.12); border-color: rgba(176,122,110,0.5); color: #B07A6E; }
  .btn-quick.qa-redirect:not(:disabled):hover { background: rgba(107,143,168,0.12); border-color: rgba(107,143,168,0.5); color: #4A7A98; }
  .btn-quick.qa-polite:not(:disabled):hover   { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }
  .btn-quick.qa-casual:not(:disabled):hover   { background: rgba(120,120,110,0.1); border-color: rgba(120,120,110,0.4); color: var(--text-secondary); }
  .btn-quick.qa-report:not(:disabled):hover   { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }

  /* ===== State machine block ===== */
  .state-block {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 10px 16px;
    margin-bottom: 14px;
    transition: background var(--transition), border-color var(--transition);
  }
  .state-flow { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .state-node {
    padding: 3px 12px;
    border-radius: 100px;
    font-size: 12px;
    font-weight: 600;
    border: 1px solid var(--border);
    background: var(--bg-card);
    color: var(--text-secondary);
    transition: background var(--transition), border-color var(--transition), color var(--transition);
  }
  .state-node.current {
    background: var(--accent-dim);
    border-color: var(--accent);
    color: var(--accent);
  }
  .state-arrow { color: var(--text-muted); font-weight: 700; font-size: 14px; }
  .state-verdict-text {
    font-size: 12px;
    color: var(--text-secondary);
    font-style: italic;
    flex: 1;
    min-width: 0;
    transition: color var(--transition);
  }

  /* ===== Strategy comparison table ===== */
  .strategy-table-wrap { overflow-x: auto; margin-top: 6px; }
  .strategy-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    color: var(--text-primary);
  }
  .strategy-table th {
    text-align: right;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
    transition: color var(--transition), border-color var(--transition);
  }
  .strategy-table th:first-child { text-align: left; }
  .strategy-table td {
    text-align: right;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    transition: border-color var(--transition), color var(--transition);
  }
  .strategy-table td.st-name { text-align: left; font-weight: 600; font-size: 13px; }
  .strategy-table tr.recommended td { background: var(--accent-dim); }
  .strategy-table tr:last-child td { border-bottom: none; }
  .recommend-badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 100px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
  }
  .recommend-badge.recommend-yes { background: var(--accent); color: var(--badge-text); }
  .recommend-badge.recommend-ok  { background: var(--bg-secondary); border: 1px solid var(--border); color: var(--text-secondary); }
  .recommend-badge.recommend-no  { background: rgba(168,90,88,0.1); color: #A85A58; }

  /* ===== Reaction simulation ===== */
  .reactions-list { display: flex; flex-direction: column; gap: 10px; margin-top: 6px; }
  .reaction-item {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    transition: background var(--transition), border-color var(--transition);
  }
  .reaction-header { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .reaction-risk {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 2px 8px;
    border-radius: 100px;
  }
  .reaction-risk.risk-low  { background: rgba(122,158,122,0.2); color: #4A8A4A; }
  .reaction-risk.risk-mid  { background: rgba(176,154,118,0.2); color: #8B7A56; }
  .reaction-risk.risk-high { background: rgba(168,90,88,0.15); color: #A85A58; }
  .reaction-line { font-size: 13px; color: var(--text-primary); font-style: italic; transition: color var(--transition); }
  .reaction-response {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 13px;
    color: var(--text-secondary);
    transition: color var(--transition);
  }
  .reaction-response-prefix {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
    padding-top: 2px;
    transition: color var(--transition);
  }
  .reaction-fallback {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 14px;
    background: var(--accent-dim);
    border: 1px solid var(--accent);
    border-radius: 10px;
    font-size: 13px;
    color: var(--text-secondary);
    transition: background var(--transition), border-color var(--transition);
  }

  /* ===== I-GONE card section ===== */
  .igone-card-section {
    background: rgba(168,90,88,0.06);
    border-color: rgba(168,90,88,0.35) !important;
  }
  .igone-card-section .special-title { color: #A85A58; }
  .igone-exit-verdict {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 12px;
    line-height: 1.6;
    transition: color var(--transition);
  }
  .igone-route {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 14px;
    flex-wrap: wrap;
  }
  .igone-route-text {
    font-size: 13px;
    color: var(--text-secondary);
    font-weight: 600;
    transition: color var(--transition);
  }
  .igone-two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 12px;
  }
  .igone-countdown { display: flex; flex-direction: column; gap: 4px; }
  .countdown-step {
    font-size: 12px;
    color: var(--text-secondary);
    padding: 4px 10px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    transition: background var(--transition), border-color var(--transition), color var(--transition);
  }
  .igone-escape {
    background: rgba(168,90,88,0.08) !important;
    border-color: rgba(168,90,88,0.3) !important;
  }
  .igone-escape .quote-icon { color: #A85A58 !important; }
  .igone-risk-reminder {
    margin-top: 12px;
    padding: 10px 14px;
    background: rgba(168,90,88,0.08);
    border: 1px solid rgba(168,90,88,0.25);
    border-radius: 10px;
    font-size: 12px;
    color: #A85A58;
    font-weight: 600;
  }

  /* ===== Empty state ===== */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 16px;
    text-align: center;
    padding: 40px 20px;
  }
  .empty-logo {
    width: min(520px, 96%);
    max-height: 72vh;
    height: auto;
    object-fit: contain;
    filter: drop-shadow(0 4px 18px rgba(0,0,0,0.10));
    opacity: 0.88;
  }
  .empty-title {
    font-size: 16px; font-weight: 600;
    color: var(--text-secondary);
    transition: color var(--transition);
  }
  .empty-sub {
    font-size: 13px; color: var(--text-muted);
    max-width: 260px; line-height: 1.7;
    transition: color var(--transition);
  }

  /* ===== Risk Dashboard ===== */
  .dashboard-card { padding: 22px 24px; }
  .dashboard-header {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 18px;
  }
  .dash-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
  }
  .dash-title-text {
    font-size: 11px; font-weight: 700;
    letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--accent);
    transition: color var(--transition);
  }
  .state-flow-inline {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  }
  .state-verdict-inline {
    font-size: 11px; color: var(--text-muted);
    font-style: italic;
    transition: color var(--transition);
  }
  /* Level gauge */
  .dash-level-row {
    display: flex; align-items: center; gap: 12px;
    margin-bottom: 16px; padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
    transition: border-color var(--transition);
  }
  .level-gauge { display: flex; gap: 5px; flex: 1; }
  .gauge-pip {
    flex: 1; height: 12px; border-radius: 4px;
    background: var(--border);
    transition: background 0.4s ease, var(--transition);
  }
  .gauge-pip.active { background: var(--accent); }
  .dash-level-val {
    font-size: 20px; font-weight: 700; color: var(--accent);
    white-space: nowrap;
    transition: color var(--transition);
  }
  .dash-level-sub {
    font-size: 11px; font-weight: 500; color: var(--text-muted);
    transition: color var(--transition);
  }
  /* Metric bars */
  .dash-bars { display: flex; flex-direction: column; gap: 9px; }
  .dash-bar-row { display: flex; align-items: center; gap: 12px; }
  .dash-bar-label {
    font-size: 12px; color: var(--text-secondary);
    width: 96px; flex-shrink: 0;
    transition: color var(--transition);
  }
  .dash-bar-track {
    flex: 1; height: 8px; background: var(--border);
    border-radius: 4px; overflow: hidden;
    transition: background var(--transition);
  }
  .dash-bar-fill {
    height: 100%; border-radius: 4px;
    transition: width 0.8s ease;
  }
  .dash-bar-fill.risk  { background: linear-gradient(90deg, var(--accent-light), var(--accent)); }
  .dash-bar-fill.safe  { background: linear-gradient(90deg, #9AC49A, #5A9A5A); }
  .dash-energy-track {
    flex: 1; position: relative; height: 8px;
    background: var(--border); border-radius: 4px; overflow: hidden;
    transition: background var(--transition);
  }
  .dash-energy-before {
    position: absolute; height: 100%;
    background: var(--accent-light); border-radius: 4px;
    transition: width 0.8s ease, background var(--transition);
  }
  .dash-energy-after {
    position: absolute; height: 100%;
    background: var(--accent); border-radius: 4px;
    transition: width 0.8s ease, background var(--transition);
  }
  .dash-bar-val {
    font-size: 13px; font-weight: 600; color: var(--text-primary);
    width: 80px; text-align: right; flex-shrink: 0;
    display: flex; align-items: center; justify-content: flex-end; gap: 5px;
    transition: color var(--transition);
  }
  .dash-bar-val.safe-val { color: #4A8A4A; }
  .energy-consume-tag { font-size: 12px; color: #A85A58; font-weight: 700; }
  .energy-remaining-tag { font-size: 11px; color: var(--text-muted); transition: color var(--transition); }
  .dash-verdict {
    margin-top: 16px; padding: 12px 16px;
    background: var(--accent-dim);
    border: 1px solid var(--accent); border-left: 3px solid var(--accent);
    border-radius: 10px;
    font-size: 13px; color: var(--text-primary); line-height: 1.7;
    transition: background var(--transition), border-color var(--transition), color var(--transition);
  }

  /* ===== Script response cards ===== */
  .script-cards-section { margin-bottom: 16px; }
  .script-section-label {
    font-size: 10px; font-weight: 700;
    letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--text-muted); margin-bottom: 10px;
    display: flex; align-items: center; gap: 8px;
    transition: color var(--transition);
  }
  .script-section-label::after {
    content: ''; flex: 1; height: 1px;
    background: var(--border);
    transition: background var(--transition);
  }
  .script-cards-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .script-card {
    display: flex; flex-direction: column; gap: 7px;
    padding: 14px 16px;
    border-radius: 14px; border: 1.5px solid var(--border);
    background: var(--bg-card);
    cursor: pointer; text-align: left; font-family: inherit;
    transition: all 0.2s;
  }
  .script-card:disabled { opacity: 0.4; cursor: not-allowed; }
  .script-card:not(:disabled):hover { transform: translateY(-2px); box-shadow: 0 4px 16px var(--shadow-md); }
  .script-card.script-open   { border-color: rgba(107,143,168,0.45); background: rgba(107,143,168,0.06); }
  .script-card.script-buffer { border-color: var(--border); }
  .script-card.script-exit   { border-color: var(--accent); background: var(--accent-dim); }
  .script-card.script-open:not(:disabled):hover   { border-color: #6B8FA8; background: rgba(107,143,168,0.14); }
  .script-card.script-buffer:not(:disabled):hover { border-color: var(--accent); background: var(--accent-dim); }
  .script-card.script-exit:not(:disabled):hover   { opacity: 0.85; }
  .script-card-tag {
    font-size: 9px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--text-muted);
    transition: color var(--transition);
  }
  .script-card.script-open .script-card-tag { color: #4A7A98; }
  .script-card.script-exit .script-card-tag { color: var(--accent); }
  .script-card-text {
    font-size: 13px; color: var(--text-primary); line-height: 1.6;
    font-weight: 500; flex: 1;
    transition: color var(--transition);
  }
  .script-card-cta {
    font-size: 10px; color: var(--text-muted);
    margin-top: 2px;
    transition: color var(--transition);
  }
  .script-card:not(:disabled):hover .script-card-cta { color: var(--accent); }

  /* ===== Actions card ===== */
  .actions-card { padding: 18px 22px; }
  .actions-card-header {
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 10px; margin-bottom: 14px;
  }
  .actions-card-label {
    font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--text-muted);
    transition: color var(--transition);
  }

  /* ===== Expand button ===== */
  .btn-expand {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 12px 18px;
    margin-bottom: 16px;
    background: none;
    border: 1.5px dashed var(--accent);
    border-radius: 12px;
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
    cursor: pointer;
    font-family: inherit;
    transition: all 0.2s;
  }
  .btn-expand:hover:not(:disabled) {
    background: var(--accent-dim);
    transform: translateY(-1px);
  }
  .btn-expand:disabled { opacity: 0.4; cursor: not-allowed; }
  .expand-hint {
    font-size: 11px;
    font-weight: 400;
    color: var(--text-muted);
    letter-spacing: 0.04em;
    transition: color var(--transition);
  }

  /* ===== Responsive ===== */
  @media (max-width: 960px) {
    .workspace {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr;
    }
    .panel-left {
      overflow: visible;
      max-height: 50vh;
    }
    .presets-section {
      overflow: hidden;
      max-height: 200px;
    }
  }
  @media (max-width: 860px) {
    .workspace {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr;
    }
    .panel-left {
      overflow: visible;
      flex-direction: column;
    }
    .presets-section { max-height: 180px; }
    .presets-grid { grid-template-columns: repeat(3, 1fr); }
  }
  @media (max-width: 600px) {
    .scripts-strip { grid-template-columns: 1fr; }
    .metrics-strip { gap: 6px; }
    .quick-btns { grid-template-columns: repeat(2, 1fr); }
    .igone-two-col { grid-template-columns: 1fr; }
    .script-cards-grid { grid-template-columns: 1fr; }
    .presets-grid { grid-template-columns: repeat(2, 1fr); }
    header { padding: 12px 0; gap: 14px; }
    .site-logo { height: 80px; }
    .tagline { font-size: 15px; }
    .tagline-sub { display: none; }
    .card { padding: 20px 16px; }
    .container { padding: 0 8px; }
  }
</style>
