(() => {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const qaParams = new URLSearchParams(window.location.search);
  const qaRockfallHitTest = qaParams.get('qa') === 'rockfall-hit';
  let qaAutoplay = qaParams.get('qa') === 'autoplay' || qaRockfallHitTest;
  let qaSimulationSteps = qaAutoplay ? Math.max(1, Math.min(64, Number.parseInt(qaParams.get('speed') || '1', 10) || 1)) : 1;
  let qaBlessing = qaParams.get('blessing');
  let qaScreen = qaParams.get('screen');
  let qaSpirit = qaParams.get('spirit');
  const qaPersistenceTest = qaParams.get('qa') === 'persist';
  const qaHasProgress = qaParams.has('progress');
  let qaProgress = Math.max(0, Number.parseInt(qaParams.get('progress') || '0', 10) || 0);
  let qaPermanent = qaParams.get('permanent');
  let qaHealProgress = Math.max(0, Number.parseInt(qaParams.get('heal') || '0', 10) || 0);
  let qaHp = Math.max(0, Math.min(3, Number.parseInt(qaParams.get('hp') || '0', 10) || 0));
  const requestedStage = Number.parseInt(qaParams.get('stage') || '1', 10);
  const qaStage = [1, 2, 3].includes(requestedStage) ? requestedStage : 1;
  const qaDebugColliders = qaParams.get('debug') === 'colliders';
  const STAGE_ONE_WORLD = { width: 10350, groundY: 440, altarX: 10020, testStart: 9405, finishX: 10120 };
  const STAGE_TWO_WORLD = { width: 9500, groundY: 440, altarX: 9150, finishX: 9200 };
  const STAGE_THREE_WORLD = { width: 10200, groundY: 440, altarX: 9800, finishX: 9800 };
  let WORLD = STAGE_ONE_WORLD;
  const VIEW = { width: 1280, height: 720 };
  const PHYSICS = { speed: 230, airSpeedMultiplier: 1.45, gravity: 2200, jump: 798, jumpHold: 1500, maxHold: .16, coyote: .115, buffer: .14 };
  const NIGHT_WATERLINE = 500;
  // The river PNG's visible shoreline begins well above the middle of its
  // transparent canvas, so this larger offset aligns the actual shoreline
  // below the playable platform surface rather than merely moving its bounds.
  const NIGHT_RIVER_ART_OFFSET_Y = 230;
  const LOG_VISUAL_PADDING = 48;
  const LOG_COLLISION_LEFT = 48;
  const LOG_COLLISION_RIGHT = 24;
  const LOG_COLLISION_ACTIVE_RATIO = 2 / 3;
  const LOG_COLLISION_ENTRY_GRACE = 26;
  const LOG_TILT_RADIANS = -10 * Math.PI / 180;
  const LOG_TILT_RISE = 34;
  const ALTAR_GROUND_SINK = { damaged: 32, restored: 28 };
  const ROCKFALL_CONFIG = {
    fallSpeed: 860, targetLead: 350, targetJitter: 20,
    landedTime: 1.05, exitSpeed: 720, colliderWidth: 62, colliderHeight: 78,
    minInterval: 5.4, maxInterval: 7.8, drawWidth: 88, drawHeight: 108
  };
  const SAVE_KEY = qaPersistenceTest ? 'riverbound-progress-v1-qa' : 'riverbound-progress-v1';
  const BLESSING_CONFIG = {
    pricesByStage: {
      1: { low: 10, high: 16 },
      2: { low: 12, high: 20 },
      3: { low: 16, high: 26 }
    },
    frog: { shieldInvulnerability: 2, shieldCooldown: 20 },
    jaguar: { temporaryAirJumps: 3, secondJumpPower: 846 },
    macaw: { temporaryDuration: 10, temporaryRadius: 260, permanentRadius: 66, healingInterval: 50 },
    spirits: {
      frog: {
        baseIcon: 'assets/ui/12_FROG_BLESSING.png', lowIcon: 'assets/ui/17_FROG_LOW_BLESSING.png', highIcon: 'assets/ui/18_FROG_HIGH_BLESSING.png',
        low: { name: 'VENOM CLOAK', scope: 'THIS RUN', description: 'Refill one obstacle shield. On break: 2s invulnerability.' },
        high: { name: 'UNDYING VENOM CLOAK', scope: 'THIS JOURNEY', description: 'A shield each stage; restores 20s after breaking.' }
      },
      jaguar: {
        baseIcon: 'assets/ui/10_JAGUAR_BLESSING.png', lowIcon: 'assets/ui/13_JAGUAR_LOW_BLESSING.png', highIcon: 'assets/ui/14_JAGUAR_HIGH_BLESSING.png',
        low: { name: "HUNTER'S STEP", scope: 'THIS RUN', description: 'Refill 3 air-jump uses; at most one each time airborne.' },
        high: { name: 'SKY HUNTER', scope: 'THIS JOURNEY', description: 'One air jump after every landing.' }
      },
      macaw: {
        baseIcon: 'assets/ui/11_MACAW_BLESSING.png', lowIcon: 'assets/ui/15_MACAW_LOW_BLESSING.png', highIcon: 'assets/ui/16_MACAW_HIGH_BLESSING.png',
        low: { name: 'TAILWIND GIFT', scope: 'THIS RUN', description: 'Refresh 10s of wide River Breath attraction.' },
        high: { name: 'WINGS OF THE LONG WIND', scope: 'THIS JOURNEY', description: 'Small magnet; heal every 50 Breath collected.' }
      }
    }
  };
  const spiritDefs = [
    {
      id: 'jaguar', name: 'JAGUAR GOD', dialogueName: 'JAGUAR SPIRIT', title: 'GUARDIAN OF COURAGE', image: 'assets/spirits/jaguar-god-transparent.png',
      dialogue: {
        weak: [
          'I used to walk for days without leaving the trees. Now the forest ends before my legs are tired.',
          'Fire on one side. Machines on the other. Where is a hunter supposed to go?'
        ],
        restored: [
          'I can smell the rain again. Thank you, child of the river.',
          'When the ground breaks apart, a jaguar does not stop. It leaps.'
        ]
      }
    },
    {
      id: 'macaw', name: 'MACAW GOD', dialogueName: 'MACAW SPIRIT', title: 'GUARDIAN OF THE SKY', image: 'assets/spirits/macaw-god-transparent.png',
      dialogue: {
        weak: ['My eyes are closed. There are fewer trees to watch over now.'],
        restored: ['We birds gather what the forest drops and carry it far. Let me teach you to gather too.']
      }
    },
    {
      id: 'frog', name: 'POISON DART FROG GOD', dialogueName: 'FROG SPIRIT', title: 'GUARDIAN OF RENEWAL', image: 'assets/spirits/poison-dart-frog-god-transparent.png',
      dialogue: {
        weak: [
          'My skin absorbs the water. I feel the poison long before you can see it.',
          'When the water turns against us, my kind have nowhere to hide.'
        ],
        restored: ['Ah... clean water. I had almost forgotten how it felt.']
      }
    }
  ];

  function defaultProgression() {
    return { version: 1, offerings: { frog: 0, jaguar: 0, macaw: 0 }, permanent: { frog: false, jaguar: false, macaw: false }, macawHealProgress: 0 };
  }

  function loadProgression() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!saved || saved.version !== 1) return defaultProgression();
      const clean = defaultProgression();
      for (const id of ['frog', 'jaguar', 'macaw']) {
        clean.offerings[id] = Math.max(0, Number(saved.offerings?.[id]) || 0);
        clean.permanent[id] = Boolean(saved.permanent?.[id]);
      }
      clean.macawHealProgress = Math.max(0, Math.floor(Number(saved.macawHealProgress) || 0)) % BLESSING_CONFIG.macaw.healingInterval;
      return clean;
    } catch (_) {
      return defaultProgression();
    }
  }

  let progression = loadProgression();
  if (qaScreen && qaHasProgress && qaSpirit && ['frog', 'jaguar', 'macaw'].includes(qaSpirit)) progression.offerings[qaSpirit] = qaProgress;
  if (['frog', 'jaguar', 'macaw'].includes(qaPermanent)) progression.permanent[qaPermanent] = true;
  if (qaHealProgress) progression.macawHealProgress = qaHealProgress % BLESSING_CONFIG.macaw.healingInterval;
  function saveProgression() {
    if (!qaPersistenceTest && (qaScreen || qaBlessing || qaPermanent || qaProgress || qaHealProgress || qaHp)) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(progression)); } catch (_) { /* Storage may be disabled; gameplay remains available. */ }
  }

  function hasBlessingPreviewOverride() {
    return Boolean(qaScreen || qaBlessing || qaPermanent || qaHasProgress || qaHealProgress || qaPersistenceTest);
  }

  function resetJourneyProgression() {
    progression = defaultProgression();
    try { localStorage.removeItem(SAVE_KEY); } catch (_) { /* Storage may be disabled; the in-memory reset still applies. */ }
  }

  const scenery = [
    { key: 'atmosphere', src: 'assets/scenery/01-distant-atmosphere.png', speed: .025, alpha: 1, scale: 1.015 },
    { key: 'temple', src: 'assets/scenery/02-distant-temple-waterfalls.png', speed: .06, alpha: .9, scale: 1.03 },
    { key: 'jungle', src: 'assets/scenery/03-midground-jungle.png', speed: .12, alpha: .92, scale: 1.02 },
    { key: 'mist', src: 'assets/scenery/04-ground-mist.png', speed: .18, alpha: .58, scale: 1.01 },
    { key: 'water', src: 'assets/scenery/05-water-river.png', speed: .22, alpha: .9, scale: 1.01 },
    { key: 'riverDetail', src: 'assets/scenery/supplement/G04_RIVER_SURFACE.png', speed: .25, alpha: .42, scale: 1, yOffset: 285 },
    { key: 'canopy', src: 'assets/scenery/06-foreground-canopy-reduced.png', speed: .34, alpha: 1, scale: 1.015 }
  ];
  const sceneryImages = Object.fromEntries(scenery.map(layer => {
    const image = new Image();
    image.decoding = 'async';
    image.src = layer.src;
    return [layer.key, image];
  }));
  const nightScenerySources = {
    moon: 'assets/scenery/night/P00_MOON_ONLY.png',
    clouds: 'assets/scenery/night/P00B_CLOUD_CLUSTER_ONLY.png',
    mountains: 'assets/scenery/night/P01_FAR_MOUNTAINS.png',
    canopy: 'assets/scenery/night/P02_DISTANT_CANOPY.png',
    temple: 'assets/scenery/night/02-distant-temple-waterfalls-night.png',
    waterfall: 'assets/scenery/night/P03_SINGLE_WATERFALL.png',
    treeLine: 'assets/scenery/night/P04_MIDGROUND_TREE_LINE.png',
    leftFrame: 'assets/scenery/night/P05_LEFT_FRAME_TREE_REDUCED.png',
    rightFrame: 'assets/scenery/night/P06_RIGHT_FRAME_TREE_REDUCED.png',
    bottomFoliage: 'assets/scenery/night/P07_BOTTOM_FOREGROUND_FOLIAGE_REDUCED.png'
  };
  const nightSceneryImages = Object.fromEntries(Object.entries(nightScenerySources).map(([key, src]) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = src;
    return [key, image];
  }));
  const stageThreeScenerySources = {
    sky: 'assets/scenery/stage3/STAGE_03_01_SKY_ATMOSPHERE.png',
    mine: 'assets/scenery/stage3/STAGE_03_02_UPSTREAM_MINE_RIDGE.png',
    forest: 'assets/scenery/stage3/STAGE_03_03_SPARSE_FOREST.png',
    river: 'assets/scenery/stage3/STAGE_03_04_SHRUNKEN_RIVER.png',
    riverbank: 'assets/scenery/stage3/STAGE_03_05_DRY_RIVERBANK.png',
    foreground: 'assets/scenery/stage3/STAGE_03_06_LOW_FOREGROUND.png'
  };
  const stageThreeSceneryImages = Object.fromEntries(Object.entries(stageThreeScenerySources).map(([key, src]) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = src;
    return [key, image];
  }));
  const supplementSources = {
    log: 'assets/scenery/supplement/fallen-log.png',
    fullLog: 'assets/scenery/supplement/G01_FALLEN_LOG.png',
    riverSurface: 'assets/scenery/supplement/G04_RIVER_SURFACE.png',
    waterRock: 'assets/scenery/supplement/G05_WATER_ROCK.png',
    vine: 'assets/scenery/supplement/G08_HANGING_THORN_VINES.png',
    firefly: 'assets/scenery/supplement/G09_FIREFLY_PARTICLE.png'
  };
  const supplementImages = Object.fromEntries(Object.entries(supplementSources).map(([key, src]) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = src;
    return [key, image];
  }));
  const groundHazardArt = {
    buttressRoot: { src: 'assets/hazards/ground/HAZARD_BUTTRESS_ROOT.png', crop: [45, 170, 1960, 500], width: 196, height: 76, groundSink: 12 },
    floodDebris: { src: 'assets/hazards/ground/HAZARD_FLOOD_DEBRIS.png', crop: [40, 145, 1970, 555], width: 202, height: 82 },
    sawnLogStack: { src: 'assets/hazards/ground/HAZARD_SAWN_LOG_STACK.png', crop: [195, 45, 1415, 800], width: 164, height: 102 },
    charredLog: { src: 'assets/hazards/ground/HAZARD_CHARRED_LOG.png', crop: [55, 105, 1945, 585], width: 198, height: 78 },
    riverbankRocks: { src: 'assets/hazards/ground/HAZARD_RIVERBANK_ROCKS.png', crop: [145, 205, 1490, 555], width: 172, height: 74 },
    uprootedLog: { src: 'assets/hazards/ground/HAZARD_UPROOTED_LOG.png', crop: [35, 55, 1730, 800], width: 184, height: 98 }
  };
  const groundHazardKeys = Object.keys(groundHazardArt);
  const groundHazardImages = Object.fromEntries(Object.entries(groundHazardArt).map(([key, art]) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = art.src;
    return [key, image];
  }));
  const restoredAltarArt = {
    jaguar: { src: 'assets/altars/altars_restored/jaguar_great_root_restored.png', crop: [0, 45, 1774, 810], width: 300 },
    macaw: { src: 'assets/altars/altars_restored/macaw_clay_lick_restored.png', crop: [30, 90, 1475, 840], width: 290 },
    frog: { src: 'assets/altars/altars_restored/frog_spring_basin_restored.png', crop: [0, 80, 1536, 850], width: 290 }
  };
  const restoredAltarImages = Object.fromEntries(Object.entries(restoredAltarArt).map(([key, art]) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = art.src;
    return [key, image];
  }));
  const preRestorationAltarArt = {
    jaguar: { src: 'assets/altars/altars_pre_restoration/jaguar_great_root.png', crop: [0, 45, 1774, 810], width: 300 },
    macaw: { src: 'assets/altars/altars_pre_restoration/macaw_clay_lick.png', crop: [30, 90, 1475, 840], width: 290 },
    frog: { src: 'assets/altars/altars_pre_restoration/frog_spring_basin.png', crop: [0, 80, 1536, 850], width: 290 }
  };
  const preRestorationAltarImages = Object.fromEntries(Object.entries(preRestorationAltarArt).map(([key, art]) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = art.src;
    return [key, image];
  }));
  const rockfallImage = new Image();
  rockfallImage.decoding = 'async';
  rockfallImage.src = 'assets/hazards/HAZARD_ROCKFALL.png';
  const breathFrameImages = [
    'assets/collectibles/collectible-drop-a.png',
    'assets/collectibles/collectible-drop-b.png',
    'assets/collectibles/collectible-drop-c.png'
  ].map(src => {
    const image = new Image();
    image.decoding = 'async';
    image.src = src;
    return image;
  });
  const healingHeartImage = new Image();
  healingHeartImage.decoding = 'async';
  healingHeartImage.src = 'assets/ui/01_HEALTH_FULL.png';
  const characterSources = {
    run: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(frame =>
      `assets/character/run-frames/run positions/pose-${String(frame).padStart(2, '0')}.png`
    ),
    slide: ['assets/character/slide.png'],
    death: ['assets/character/die.png'],
    jump: ['assets/character/jump-1.png', 'assets/character/jump-2.png', 'assets/character/jump-3.png'],
    doubleJump: [1, 2, 3, 4, 5].map(frame => `assets/character/double-jump-${frame}.png`)
  };
  const characterImages = Object.fromEntries(Object.entries(characterSources).map(([stateName, sources]) => [
    stateName,
    sources.map(src => {
      const image = new Image();
      image.decoding = 'async';
      image.src = src;
      return image;
    })
  ]));
  const platformArt = {
    short: { src: 'assets/platforms/DAY_01_SHORT.png', crop: [380, 250, 780, 520], topInset: 106 },
    medium: { src: 'assets/platforms/DAY_02_MEDIUM.png', crop: [300, 300, 950, 460], topInset: 80 },
    long: { src: 'assets/platforms/DAY_03_LONG.png', crop: [170, 330, 1200, 420], topInset: 43 },
    extra: { src: 'assets/platforms/DAY_04_EXTRA_LONG.png', crop: [60, 350, 1410, 340], topInset: 49 },
    nightShort: { src: 'assets/platforms/night/NIGHT_01_SHORT.png', crop: [390, 285, 750, 485], surfaceY: 140 },
    nightMedium: { src: 'assets/platforms/night/NIGHT_02_MEDIUM.png', crop: [300, 275, 940, 485], surfaceY: 145 },
    nightLong: { src: 'assets/platforms/night/NIGHT_03_LONG.png', crop: [55, 280, 1430, 510], surfaceY: 120 },
    nightExtra: { src: 'assets/platforms/night/NIGHT_04_EXTRA_LONG.png', crop: [55, 300, 1430, 470], surfaceY: 118 }
  };
  const nightPlatformKeys = ['nightShort', 'nightMedium', 'nightLong', 'nightExtra'];
  const platformImages = Object.fromEntries(Object.entries(platformArt).map(([key, art]) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = art.src;
    return [key, image];
  }));

  const ui = Object.fromEntries([
    'hud','life-value','breath-value','totem-value','progress-label','progress-fill','cover-screen','background-story-screen','background-story-image','background-story-progress','background-story-text','title-screen','instruction-screen','story-screen',
    'story-line','dialogue-speaker','dialogue-portrait','dialogue-box-art','dialogue-prompt',
    'altar-screen','altar-breath','spirit-dialogue-screen','spirit-dialogue-portrait','spirit-dialogue-name','spirit-dialogue-line','spirit-dialogue-prompt','blessing-screen','pause-screen','end-screen',
    'altar-spirit-name','altar-spirit-title','altar-spirit-image','altar-spirit-caption',
    'blessing-spirit-heading','blessing-spirit-image','blessing-spirit-caption',
    'end-title','end-eyebrow','end-stats','end-art','touch-jump','touch-crouch','pause-button','music-button','shield-icon','stage-label',
    'altar-requirement','offer-button','altar-kicker','jump-status','magnet-status','blessing-progress','stage-start-art'
  ].map(id => [id.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), document.getElementById(id)]));

  const audio = {
    intro: document.getElementById('intro-bgm-audio'),
    bgm: document.getElementById('bgm-audio'),
    heartbeat: document.getElementById('heartbeat-audio'),
    click: document.getElementById('ui-click-audio'),
    spirits: {
      frog: document.getElementById('altar-frog-audio'),
      macaw: document.getElementById('altar-macaw-audio'),
      jaguar: document.getElementById('altar-jaguar-audio')
    },
    effects: {
      rockfall: document.getElementById('rockfall-audio'),
      damage: document.getElementById('damage-audio'),
      riverBreath: document.getElementById('river-breath-audio'),
      heartHeal: document.getElementById('heart-heal-audio')
    }
  };
  const AUDIO_CONFIG = { introVolume: .32, gameplayVolume: .28, heartbeatVolume: .48, fadeIn: 1.6, fadeOut: 1.25, spiritVolume: .62, spiritDuration: 4.5, spiritFadeOut: .7 };
  const MUSIC_PREF_KEY = 'riverbound-music-enabled-v1';
  audio.intro.volume = 0;
  audio.bgm.volume = 0;
  audio.click.volume = .55;
  let musicEnabled = localStorage.getItem(MUSIC_PREF_KEY) !== 'false';
  let audioStarted = false;
  let bgmTargetVolume = 0;
  let introAudioStarted = false;
  let introTargetVolume = 0;
  let activeSpiritSound = null;
  let spiritSoundTimer = 0;
  let gameAudioUnlocked = false;
  let heartbeatActive = false;

  function unlockGameAudio() {
    if (gameAudioUnlocked) return;
    gameAudioUnlocked = true;
    [audio.heartbeat, ...Object.values(audio.spirits), ...Object.values(audio.effects)].forEach(sound => {
      if (!sound) return;
      sound.muted = true;
      sound.currentTime = 0;
      const unlockAttempt = sound.play();
      if (!unlockAttempt) {
        sound.pause();
        sound.muted = false;
        return;
      }
      unlockAttempt.then(() => {
        sound.pause();
        sound.currentTime = 0;
        sound.muted = false;
        sound.volume = AUDIO_CONFIG.spiritVolume;
      }).catch(() => {
        sound.muted = false;
      });
    });
  }

  function stopSpiritSound() {
    if (activeSpiritSound) {
      activeSpiritSound.pause();
      activeSpiritSound.currentTime = 0;
      activeSpiritSound.volume = AUDIO_CONFIG.spiritVolume;
    }
    activeSpiritSound = null;
    spiritSoundTimer = 0;
  }

  function resumeIntroBgm() {
    if (!musicEnabled || introAudioStarted || !['cover', 'prologue', 'story', 'instructions'].includes(state?.mode)) return;
    audio.intro.volume = 0;
    introTargetVolume = AUDIO_CONFIG.introVolume;
    introAudioStarted = true;
    audio.intro.play().catch(() => { introAudioStarted = false; });
  }

  function fadeOutIntroBgm() {
    introTargetVolume = 0;
  }

  function stopIntroBgm() {
    introTargetVolume = 0;
    audio.intro.pause();
    audio.intro.currentTime = 0;
    audio.intro.volume = 0;
    introAudioStarted = false;
  }

  function startBgm() {
    stopSpiritSound();
    audio.bgm.currentTime = 0;
    audio.bgm.volume = 0;
    if (!musicEnabled) {
      bgmTargetVolume = 0;
      audioStarted = false;
      return;
    }
    bgmTargetVolume = AUDIO_CONFIG.gameplayVolume;
    audioStarted = true;
    audio.bgm.play().catch(() => { audioStarted = false; });
  }

  function resumeBgm() {
    if (!musicEnabled || audioStarted || state?.mode !== 'running') return;
    audio.bgm.volume = 0;
    bgmTargetVolume = AUDIO_CONFIG.gameplayVolume;
    audioStarted = true;
    audio.bgm.play().catch(() => { audioStarted = false; });
  }

  function fadeOutBgm() {
    bgmTargetVolume = 0;
  }

  function stopHeartbeat() {
    audio.heartbeat.pause();
    audio.heartbeat.currentTime = 0;
    heartbeatActive = false;
  }

  function updateHeartbeatAudio() {
    const shouldPlay = musicEnabled && state?.mode === 'running' && state.player.hp === 1;
    if (!shouldPlay) {
      if (heartbeatActive || !audio.heartbeat.paused) stopHeartbeat();
      return;
    }
    if (heartbeatActive) return;
    heartbeatActive = true;
    audio.heartbeat.currentTime = 0;
    audio.heartbeat.volume = AUDIO_CONFIG.heartbeatVolume;
    audio.heartbeat.play().catch(() => { heartbeatActive = false; });
  }

  function updateAudio(dt) {
    updateHeartbeatAudio();
    if (introAudioStarted) {
      const delta = introTargetVolume - audio.intro.volume;
      const duration = delta > 0 ? AUDIO_CONFIG.fadeIn : AUDIO_CONFIG.fadeOut;
      const step = AUDIO_CONFIG.introVolume * dt / duration;
      audio.intro.volume = delta > 0
        ? Math.min(introTargetVolume, audio.intro.volume + step)
        : Math.max(introTargetVolume, audio.intro.volume - step);
      if (introTargetVolume === 0 && audio.intro.volume <= .001) stopIntroBgm();
    }
    if (audioStarted) {
      const delta = bgmTargetVolume - audio.bgm.volume;
      const fadingIn = delta > 0;
      const duration = fadingIn ? AUDIO_CONFIG.fadeIn : AUDIO_CONFIG.fadeOut;
      const step = AUDIO_CONFIG.gameplayVolume * dt / duration;
      audio.bgm.volume = fadingIn
        ? Math.min(bgmTargetVolume, audio.bgm.volume + step)
        : Math.max(bgmTargetVolume, audio.bgm.volume - step);
      if (bgmTargetVolume === 0 && audio.bgm.volume <= .001) {
        audio.bgm.volume = 0;
        audio.bgm.pause();
        audio.bgm.currentTime = 0;
        audioStarted = false;
      }
    }
    if (activeSpiritSound) {
      spiritSoundTimer = Math.max(0, spiritSoundTimer - dt);
      activeSpiritSound.volume = spiritSoundTimer < AUDIO_CONFIG.spiritFadeOut
        ? AUDIO_CONFIG.spiritVolume * spiritSoundTimer / AUDIO_CONFIG.spiritFadeOut
        : AUDIO_CONFIG.spiritVolume;
      if (spiritSoundTimer <= 0) stopSpiritSound();
    }
  }

  function playAltarSound(spiritId) {
    stopSpiritSound();
    const sound = audio.spirits[spiritId];
    if (!sound) return;
    activeSpiritSound = sound;
    spiritSoundTimer = AUDIO_CONFIG.spiritDuration;
    sound.volume = AUDIO_CONFIG.spiritVolume;
    sound.currentTime = 0;
    sound.play().catch(() => stopSpiritSound());
  }

  function playEffect(sound, volume) {
    if (!sound) return;
    sound.currentTime = 0;
    sound.volume = volume;
    sound.play().catch(() => {});
  }

  function playRockfallSound() { playEffect(audio.effects.rockfall, .62); }
  function playDamageSound() { playEffect(audio.effects.damage, .72); }
  function playRiverBreathSound() { playEffect(audio.effects.riverBreath, .56); }
  function playHeartHealSound() { playEffect(audio.effects.heartHeal, .64); }

  function playUiClick() {
    audio.click.currentTime = 0;
    audio.click.play().catch(() => {});
  }

  function updateMusicButton() {
    ui.musicButton.setAttribute('aria-pressed', String(musicEnabled));
    ui.musicButton.setAttribute('aria-label', musicEnabled ? 'Turn music off' : 'Turn music on');
    ui.musicButton.title = musicEnabled ? 'Music on' : 'Music off';
    ui.musicButton.querySelector('small').textContent = musicEnabled ? 'MUSIC ON' : 'MUSIC OFF';
  }

  function toggleMusic() {
    musicEnabled = !musicEnabled;
    localStorage.setItem(MUSIC_PREF_KEY, String(musicEnabled));
    updateMusicButton();
    if (musicEnabled) {
      if (['cover', 'prologue', 'story', 'instructions'].includes(state.mode)) resumeIntroBgm();
      else resumeBgm();
    } else {
      fadeOutIntroBgm();
      fadeOutBgm();
      stopHeartbeat();
    }
  }

  // Fixed shuffled order keeps each run learnable while varying platform silhouettes.
  const stageOnePlatforms = [
    { x: 0, w: 950, art: 'extra' },
    { x: 1080, w: 500, art: 'short' },
    { x: 1730, w: 800, art: 'long' },
    { x: 2650, w: 650, art: 'medium' },
    { x: 3445, w: 800, art: 'long' },
    { x: 4380, w: 950, art: 'extra' },
    { x: 5485, w: 500, art: 'short' },
    { x: 6110, w: 650, art: 'medium' },
    { x: 6905, w: 950, art: 'extra' },
    { x: 7985, w: 650, art: 'medium' },
    { x: 8785, w: 500, art: 'short' },
    { x: 9405, w: 865, art: 'long' }
  ];
  const stageOneObstacles = [
    { type: 'log', x: 1320, y: WORLD.groundY - 70, w: 100, h: 70, label: 'FALLEN LOG' },
    { type: 'vine', x: 2050, y: WORLD.groundY - 106, w: 150, h: 66, label: 'LOW VINES' },
    { type: 'log', x: 3700, y: WORLD.groundY - 72, w: 104, h: 72, label: 'FALLEN LOG' },
    { type: 'vine', x: 4800, y: WORLD.groundY - 108, w: 150, h: 68, label: 'LOW VINES' },
    { type: 'log', x: 5700, y: WORLD.groundY - 76, w: 110, h: 76, label: 'FALLEN LOG' },
    { type: 'log', x: 7100, y: WORLD.groundY - 70, w: 100, h: 70, label: 'FALLEN LOG' },
    { type: 'log', x: 8200, y: WORLD.groundY - 74, w: 108, h: 74, label: 'BLESSING LOG' },
    { type: 'vine', x: 8950, y: WORLD.groundY - 108, w: 150, h: 68, label: 'BLESSING VINES' },
    { type: 'vine', x: 9850, y: WORLD.groundY - 108, w: 150, h: 68, label: 'BLESSING VINES' }
  ];

  const stageOneCollectibles = [
    { type: 'breath', x: 760, y: WORLD.groundY - 75 }, { type: 'breath', x: 1110, y: WORLD.groundY - 130 },
    { type: 'breath', x: 1510, y: WORLD.groundY - 72 }, { type: 'heart', x: 1750, y: WORLD.groundY - 70 },
    { type: 'breath', x: 2320, y: WORLD.groundY - 70 }, { type: 'breath', x: 2810, y: WORLD.groundY - 140 },
    { type: 'breath', x: 2915, y: WORLD.groundY - 155 }, { type: 'breath', x: 3190, y: WORLD.groundY - 72 },
    { type: 'breath', x: 4390, y: WORLD.groundY - 70 },
    { type: 'breath', x: 4860, y: WORLD.groundY - 130 }, { type: 'heart', x: 5290, y: WORLD.groundY - 72 },
    { type: 'breath', x: 5550, y: WORLD.groundY - 140 }, { type: 'breath', x: 5680, y: WORLD.groundY - 155 },
    { type: 'breath', x: 6210, y: WORLD.groundY - 170 }, { type: 'breath', x: 6750, y: WORLD.groundY - 150 },
    { type: 'breath', x: 6970, y: WORLD.groundY - 170 }, { type: 'breath', x: 7280, y: WORLD.groundY - 72 },
    { type: 'breath', x: 8110, y: WORLD.groundY - 75 }, { type: 'breath', x: 8470, y: WORLD.groundY - 230, bonus: true },
    { type: 'breath', x: 8880, y: WORLD.groundY - 170 }, { type: 'breath', x: 8840, y: WORLD.groundY - 185 },
    { type: 'heart', x: 9200, y: WORLD.groundY - 72 }, { type: 'breath', x: 9440, y: WORLD.groundY - 72 },
    { type: 'breath', x: 9700, y: WORLD.groundY - 170 }, { type: 'breath', x: 9860, y: WORLD.groundY - 170 }
  ];

  const stageOneTutorials = [
    { x: 820, text: 'SPACE / ↑  ·  HOLD TO JUMP HIGHER', shown: false },
    { x: 1660, text: '↓ / CTRL  ·  HOLD TO CROUCH UNDER VINES', shown: false },
    { x: 2390, text: 'RAVINE AHEAD  ·  JUMP EARLY', shown: false },
    { x: 3740, text: 'A GOLD TOTEM BLOCKS THE NEXT HIT', shown: false }
  ];

  // Stage 2 is intentionally data-only: designers can retune platform gaps,
  // action spacing and pickups here without touching physics or collision code.
  const stageTwoPlatforms = [
    { x: 0, w: 1000, art: 'extra' }, { x: 1130, w: 770, art: 'long' },
    { x: 2030, w: 770, art: 'medium' }, { x: 2930, w: 1070, art: 'extra' },
    { x: 4130, w: 1070, art: 'extra' }, { x: 5330, w: 1170, art: 'extra' },
    { x: 6630, w: 670, art: 'medium' }, { x: 7430, w: 1170, art: 'extra' },
    { x: 8730, w: 670, art: 'medium' }
  ];

  const stageTwoObstacles = [
    // Re-entry: isolated actions with generous sight lines.
    { type: 'log', x: 1400, y: STAGE_TWO_WORLD.groundY - 72, w: 104, h: 72, label: 'FALLEN LOG' },
    { type: 'vine', x: 2300, y: STAGE_TWO_WORLD.groundY - 108, w: 150, h: 68, label: 'LOW VINES' },
    // Action pairs: jump-land-crouch, then crouch-rise-jump.
    { type: 'log', x: 3150, y: STAGE_TWO_WORLD.groundY - 74, w: 108, h: 74, label: 'FALLEN LOG' },
    { type: 'vine', x: 3650, y: STAGE_TWO_WORLD.groundY - 108, w: 150, h: 68, label: 'LOW VINES' },
    { type: 'vine', x: 4350, y: STAGE_TWO_WORLD.groundY - 108, w: 150, h: 68, label: 'LOW VINES' },
    { type: 'log', x: 4800, y: STAGE_TWO_WORLD.groundY - 74, w: 108, h: 74, label: 'FALLEN LOG' },
    // Risk/reward sequence followed by a visible breather.
    { type: 'log', x: 5550, y: STAGE_TWO_WORLD.groundY - 76, w: 110, h: 76, label: 'FALLEN LOG' },
    { type: 'vine', x: 6150, y: STAGE_TWO_WORLD.groundY - 108, w: 150, h: 68, label: 'LOW VINES' },
    // Final synthesis uses only previously taught pairings.
    { type: 'vine', x: 7650, y: STAGE_TWO_WORLD.groundY - 108, w: 150, h: 68, label: 'LOW VINES' },
    { type: 'log', x: 8100, y: STAGE_TWO_WORLD.groundY - 74, w: 108, h: 74, label: 'FALLEN LOG' }
  ];

  const stageTwoCollectibles = [
    // Safe re-entry line.
    { type: 'breath', x: 500, y: 366 }, { type: 'breath', x: 850, y: 366 },
    { type: 'breath', x: 1240, y: 366 }, { type: 'breath', x: 1770, y: 366 },
    { type: 'breath', x: 2160, y: 366 }, { type: 'heart', x: 2660, y: 366 },
    // Optional high arcs above logs; the ground line remains safe to skip.
    { type: 'breath', x: 3110, y: 285, bonus: true }, { type: 'breath', x: 3180, y: 255, bonus: true },
    { type: 'breath', x: 3250, y: 280, bonus: true }, { type: 'breath', x: 3970, y: 366 },
    { type: 'breath', x: 4760, y: 280, bonus: true }, { type: 'breath', x: 4830, y: 250, bonus: true },
    { type: 'breath', x: 4900, y: 282, bonus: true },
    { type: 'breath', x: 5510, y: 275, bonus: true }, { type: 'breath', x: 5580, y: 245, bonus: true },
    { type: 'breath', x: 5650, y: 275, bonus: true },
    // Low tunnel string: below, never inside, the vine collision rectangle.
    { type: 'breath', x: 6220, y: 418, bonus: true }, { type: 'breath', x: 6260, y: 418, bonus: true },
    { type: 'breath', x: 6300, y: 418, bonus: true },
    // Breather and final synthesis.
    { type: 'breath', x: 6760, y: 366 }, { type: 'heart', x: 7050, y: 366 },
    { type: 'breath', x: 7580, y: 366 }, { type: 'breath', x: 8060, y: 280, bonus: true },
    { type: 'breath', x: 8130, y: 250, bonus: true }, { type: 'breath', x: 8500, y: 366 },
    { type: 'breath', x: 8840, y: 366 }, { type: 'breath', x: 9100, y: 366 }
  ];

  const stageTwoTutorials = [
    { x: 700, text: 'STAGE 2 · UNDER THE MOONLIT CANOPY', shown: false },
    { x: 2850, text: 'COMBO · JUMP, LAND, THEN CROUCH', shown: false },
    { x: 4050, text: 'COMBO · CROUCH, RISE, THEN JUMP', shown: false },
    { x: 5250, text: 'BONUS BREATH REWARDS PRECISE TIMING', shown: false },
    { x: 6550, text: 'BREATHE · THE FINAL TRIAL LIES AHEAD', shown: false }
  ];

  // Stage 3: a fixed, increasingly damaged river corridor. Every required gap
  // remains within the standard single-jump envelope; elevated bonus Breath is optional.
  const stageThreePlatforms = [
    { x: 0, w: 1100, art: 'extra' }, { x: 1220, w: 800, art: 'long' },
    { x: 2155, w: 700, art: 'medium' }, { x: 3000, w: 600, art: 'short' },
    { x: 3720, w: 980, art: 'extra' }, { x: 4820, w: 730, art: 'long' },
    { x: 5675, w: 1100, art: 'extra' }, { x: 6930, w: 600, art: 'short' },
    { x: 7655, w: 900, art: 'long' }, { x: 8690, w: 1360, art: 'extra' }
  ];

  const stageThreeObstacles = [
    // Familiar opening actions.
    { type: 'log', x: 1450, y: STAGE_THREE_WORLD.groundY - 72, w: 104, h: 72, label: 'SCARRED LOG' },
    { type: 'vine', x: 1700, y: STAGE_THREE_WORLD.groundY - 108, w: 150, h: 68, label: 'WITHERED VINES' },
    // Fallen-timber combinations: jump-land-crouch, then crouch-rise-jump.
    { type: 'log', x: 4000, y: STAGE_THREE_WORLD.groundY - 74, w: 108, h: 74, label: 'FALLEN TIMBER' },
    { type: 'vine', x: 4400, y: STAGE_THREE_WORLD.groundY - 108, w: 150, h: 68, label: 'WITHERED VINES' },
    { type: 'vine', x: 5000, y: STAGE_THREE_WORLD.groundY - 108, w: 150, h: 68, label: 'WITHERED VINES' },
    // Three readable final groups separated by safe ground or a visible gap.
    { type: 'log', x: 7100, y: STAGE_THREE_WORLD.groundY - 76, w: 110, h: 76, label: 'FALLEN TIMBER' },
    { type: 'vine', x: 7800, y: STAGE_THREE_WORLD.groundY - 108, w: 150, h: 68, label: 'WITHERED VINES' },
    { type: 'log', x: 8900, y: STAGE_THREE_WORLD.groundY - 76, w: 110, h: 76, label: 'FALLEN TIMBER' },
    { type: 'vine', x: 9450, y: STAGE_THREE_WORLD.groundY - 108, w: 150, h: 68, label: 'WITHERED VINES' }
  ];

  const stageThreeCollectibles = [
    { type: 'breath', x: 520, y: 366 }, { type: 'breath', x: 900, y: 366 },
    { type: 'breath', x: 1300, y: 300 }, { type: 'breath', x: 1810, y: 418, bonus: true },
    { type: 'breath', x: 2300, y: 366 }, { type: 'breath', x: 2700, y: 270, bonus: true },
    { type: 'breath', x: 3180, y: 250, bonus: true }, { type: 'heart', x: 3440, y: 366 },
    { type: 'breath', x: 3900, y: 255, bonus: true }, { type: 'breath', x: 4450, y: 418, bonus: true },
    { type: 'breath', x: 5050, y: 418, bonus: true }, { type: 'breath', x: 5300, y: 245, bonus: true },
    { type: 'breath', x: 5800, y: 366 }, { type: 'breath', x: 6150, y: 366 },
    { type: 'breath', x: 6500, y: 366 },
    { type: 'breath', x: 7120, y: 55, bonus: true }, { type: 'breath', x: 7350, y: 270, bonus: true },
    { type: 'breath', x: 7850, y: 418, bonus: true }, { type: 'breath', x: 8350, y: 366 },
    { type: 'breath', x: 8850, y: 245, bonus: true }, { type: 'breath', x: 9100, y: 366 },
    { type: 'breath', x: 9340, y: 418, bonus: true }, { type: 'breath', x: 9700, y: 366 }
  ];

  const stageThreeTutorials = [
    { x: 600, text: 'STAGE 3 · THE BROKEN RIVER', shown: false },
    { x: 2050, text: 'BROKEN BANKS · READ EACH LANDING BEFORE YOU LEAP', shown: false },
    { x: 3550, text: 'FALLEN TIMBER · CHANGE STANCE AFTER LANDING', shown: false },
    { x: 5750, text: 'A QUIET STRETCH · GATHER YOUR BREATH', shown: false },
    { x: 6850, text: 'HIGH BREATH IS OPTIONAL · JAGUAR CAN REACH IT', shown: false },
    { x: 8600, text: 'THE SPIRIT DWELLING LIES AHEAD', shown: false }
  ];

  const STAGES = {
    1: {
      id: 1, name: 'THE QUIET RIVER', label: 'STAGE 01 · THE QUIET RIVER', world: STAGE_ONE_WORLD,
      platforms: stageOnePlatforms, obstacles: stageOneObstacles, collectibles: stageOneCollectibles,
      tutorials: stageOneTutorials, checkpoints: [600, 1150, 1800, 2700, 3520, 4450, 5550, 6200, 6970, 8020, 8850, 9450],
      runSpeed: 280, hasAltar: true, nextStage: 2
    },
    2: {
      id: 2, name: 'MOONLIT FALLS', label: 'STAGE 02 · MOONLIT FALLS', world: STAGE_TWO_WORLD,
      platforms: stageTwoPlatforms, obstacles: stageTwoObstacles, collectibles: stageTwoCollectibles,
      tutorials: stageTwoTutorials, checkpoints: [600, 1180, 2080, 2980, 4180, 5380, 6680, 7480, 8780],
      runSpeed: 230, hasAltar: true, nextStage: 3
    },
    3: {
      id: 3, name: 'THE BROKEN RIVER', label: 'STAGE 03 · THE BROKEN RIVER', world: STAGE_THREE_WORLD,
      platforms: stageThreePlatforms, obstacles: stageThreeObstacles, collectibles: stageThreeCollectibles,
      tutorials: stageThreeTutorials, checkpoints: [600, 1280, 2220, 3060, 3800, 4900, 5760, 7000, 7720, 8760, 9500],
      runSpeed: 230, hasAltar: true, damaged: true
    }
  };

  let activeStage = STAGES[1];
  let platforms = [];
  let pits = [];
  let obstacles = [];
  let collectibleDefs = [];
  let tutorialDefs = [];
  let stageValidationIssues = [];

  function activateStage(stageNumber) {
    activeStage = STAGES[stageNumber] || STAGES[1];
    WORLD = activeStage.world;
    platforms = activeStage.id === 2 ? assignNightPlatformCycle(activeStage.platforms) : activeStage.platforms;
    obstacles = assignGroundHazardVariants(activeStage.obstacles);
    collectibleDefs = activeStage.collectibles;
    tutorialDefs = activeStage.tutorials;
    pits = platforms.slice(0, -1).map((platform, index) => {
      const next = platforms[index + 1];
      return { x: platform.x + platform.w, w: next.x - (platform.x + platform.w) };
    });
    stageValidationIssues = validateStageConfig(activeStage);
    if (stageValidationIssues.length) console.warn(`Stage ${activeStage.id} layout issues`, stageValidationIssues);
  }

  function assignGroundHazardVariants(sourceObstacles) {
    let bag = [];
    let previous = null;
    return sourceObstacles.map(obstacle => {
      if (obstacle.type !== 'log') return obstacle;
      if (bag.length === 0) {
        bag = [...groundHazardKeys];
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
        if (previous && bag[bag.length - 1] === previous) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      }
      const groundHazard = bag.pop();
      previous = groundHazard;
      return { ...obstacle, groundHazard };
    });
  }

  function assignNightPlatformCycle(sourcePlatforms) {
    let bag = [];
    let previous = null;
    return sourcePlatforms.map(platform => {
      if (bag.length === 0) {
        bag = [...nightPlatformKeys];
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
        if (previous && bag[bag.length - 1] === previous) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      }
      const art = bag.pop();
      previous = art;
      return { ...platform, art };
    });
  }

  const input = { jump: false, jumpPressed: false, crouch: false, autoJumpKind: null };
  let state;

  function chooseAnimalGod(excludedIds = []) {
    const excluded = new Set(excludedIds);
    const requested = spiritDefs.find(spirit => spirit.id === qaSpirit && !excluded.has(spirit.id));
    if (requested) return requested;
    const choices = spiritDefs.filter(spirit => !excluded.has(spirit.id));
    if (choices.length === 0) return spiritDefs[Math.floor(Math.random() * spiritDefs.length)];
    return choices[Math.floor(Math.random() * choices.length)];
  }

  function freshState(carry = {}) {
    const visitedSpiritIds = [...new Set((carry.visitedSpiritIds || []).filter(id => spiritDefs.some(spirit => spirit.id === id)))];
    const selectedSpirit = carry.spirit || chooseAnimalGod(visitedSpiritIds);
    const journeySpiritIds = [...new Set([...visitedSpiritIds, selectedSpirit.id])];
    const temp = {
      frogShield: Math.max(0, Math.min(1, carry.temp?.frogShield || 0)),
      jaguarJumps: Math.max(0, Math.min(BLESSING_CONFIG.jaguar.temporaryAirJumps, carry.temp?.jaguarJumps || 0)),
      macawMagnetTime: Math.max(0, Math.min(BLESSING_CONFIG.macaw.temporaryDuration, carry.temp?.macawMagnetTime || 0))
    };
    if (progression.permanent.frog) temp.frogShield = 0;
    if (progression.permanent.jaguar) temp.jaguarJumps = 0;
    return {
      mode: 'title', previousMode: null, time: 0, runTime: 0, cameraX: 0,
      storyIndex: 0, storyTimer: 0, storyRenderedChars: 0, storyLineComplete: false, instructionsShown: false, deathTimer: 0,
      stageNumber: activeStage.id, breath: carry.breath ?? 0, stageBreath: carry.stageBreath ?? 0,
      runBreathCollected: carry.runBreathCollected ?? 0, temp,
      spirit: selectedSpirit, visitedSpiritIds: journeySpiritIds,
      altarOffered: !activeStage.hasAltar, altarSoundPlayed: false, offeringBusy: false, restored: false, restorationTimer: 0,
      altarInteractionCompleted: false, altarWeakDialogueShown: false, altarRestoredDialogueShown: false,
      spiritDialoguePhase: null, spiritDialoguePage: 0, spiritDialogueTimer: 0,
      spiritDialogueRenderedChars: 0, spiritDialogueLineComplete: false, spiritDialogueReturnMode: null,
      checkpoint: 200, message: '', messageTimer: 0, lastDamage: '', damageEvents: [], debugColliders: qaDebugColliders,
      rockfalls: [], rockfallTimer: 4.2 + Math.random() * 1.8,
      player: { x: 220, y: WORLD.groundY - 76, w: 44, h: 76, vy: 0, grounded: true, coyote: PHYSICS.coyote,
        jumpBuffer: 0, jumpHold: 0, airJumpAvailable: false, doubleJumpStarted: -Infinity,
        renewableShieldReady: progression.permanent.frog, renewableShieldCooldown: 0,
        hp: carry.hp ?? 3, maxHp: 3, invuln: 0, hurtFlash: 0, dead: false,
        totem: carry.totem ?? false, crouching: false },
      stageEntryCarry: {
        hp: carry.hp ?? 3,
        breath: carry.breath ?? 0,
        stageBreath: carry.stageBreath ?? 0,
        runBreathCollected: carry.runBreathCollected ?? 0,
        totem: carry.totem ?? false,
        temp: { ...temp },
        spirit: selectedSpirit,
        visitedSpiritIds: [...journeySpiritIds]
      },
      collectibles: collectibleDefs.map((v, i) => ({ ...v, id: i, collected: false })),
      tutorials: tutorialDefs.map(v => ({ ...v })),
      particles: []
    };
  }

  const DIALOGUE_CHARACTERS_PER_SECOND = 42;
  const backgroundStory = [
    {
      image: 'assets/story/background-cg/02_CG_Dry_Year_1920x1080.png',
      alt: 'The child and grandmother looking over a river narrowed by drought',
      text: 'This is a dry year. Far across the ocean, the warm current has returned, and the rains are late. The river that carries the community to school, to the clinic, and to the market grows narrower every day. Canoes rest on cracked mud.'
    },
    {
      image: 'assets/story/background-cg/03_CG_Unseen_Pollution_1920x1080.png',
      alt: 'Mining machinery operating beside the drought-stricken river',
      text: 'Upstream, the gold diggers have returned. They were driven out once, but the price of gold keeps rising along with their insatiable greed, so their machines are running again.'
    },
    {
      image: 'assets/story/background-cg/03B_CG_Invisible_Mercury_1920x1080.png',
      alt: 'The child and grandmother examining fish beside a river polluted by invisible mercury',
      text: 'They wash the riverbed with mercury, a poison no one can see. The water looks the same. The fish still swim. But now, before a family eats, they stop and wonder what the river has brought to them.'
    },
    {
      image: 'assets/story/background-cg/04_CG_Fading_Guardians_1920x1080.png',
      alt: 'The child and grandmother remembering the animal guardians above the rainforest',
      text: 'The animals are leaving. The forest grows quieter. The old stories of the guardians, once told every night, are rarely told anymore.'
    },
    {
      image: 'assets/story/background-cg/04B_CG_Fading_Guardians_Polluted_1920x1080.png',
      alt: 'The animal guardians fading above a polluted and damaged forest',
      text: 'And without their stories, the guardians begin to fade.'
    },
    {
      image: 'assets/story/background-cg/05_CG_Follow_The_River_1920x1080.png',
      alt: 'The child looking along the river toward distant mountains',
      text: 'The river is still here.'
    },
    {
      image: 'assets/story/background-cg/06_CG_Begin_Journey_Collect_River_Breath_1920x1080.png',
      alt: 'The child beginning a journey along the river',
      text: 'But the connections it once carried, between people, animals, and the forest, are slipping away.'
    }
  ];
  backgroundStory.forEach(entry => { const image = new Image(); image.decoding = 'async'; image.src = entry.image; });
  let backgroundStoryShown = false;
  let backgroundStoryIndex = 0;
  const openingDialogue = [
    {
      speaker: 'CHILD', side: 'child', portrait: 'assets/story/child-worried.png', box: 'assets/story/dialog-right.png',
      text: "Grandmother, the boat still can't leave. The children waited at the dock all morning."
    },
    {
      speaker: 'GRANDMOTHER', side: 'grandmother', portrait: 'assets/story/grandmother-concerned.png', box: 'assets/story/dialog-left.png',
      text: 'The school is still across the river. The clinic is still downstream. But this year, the river cannot take us there.'
    },
    {
      speaker: 'CHILD', side: 'child', portrait: 'assets/story/child-surprised.png', box: 'assets/story/dialog-right.png',
      text: 'Father says the rains are late because the ocean is warm again.'
    },
    {
      speaker: 'GRANDMOTHER', side: 'grandmother', portrait: 'assets/story/grandmother-listening.png', box: 'assets/story/dialog-left.png',
      text: 'When I was young, I had to raise my voice to speak here. Listen now....Only the machines upstream. Our grandparents told stories of the guardians every night. We stopped telling them, and the guardians began to fade.'
    },
    {
      speaker: 'GRANDMOTHER', side: 'grandmother', portrait: 'assets/story/grandmother-looking.png', box: 'assets/story/dialog-left.png',
      text: 'Follow the river upstream. Gather River Breath. Find the shrines. Help the guardians remember us, and we will remember them.'
    },
    {
      speaker: 'CHILD', side: 'child', portrait: 'assets/story/child-surprised.png', box: 'assets/story/dialog-right.png',
      text: "I'll go. Even where the river has gone dry."
    }
  ];

  function updateSpiritUI() {
    const spirit = state.spirit;
    const frogFacesRight = spirit.id === 'frog';
    ui.altarScreen.classList.toggle('frog-spirit', frogFacesRight);
    ui.blessingScreen.classList.toggle('frog-spirit', frogFacesRight);
    ui.altarSpiritName.textContent = spirit.name;
    ui.altarSpiritTitle.textContent = spirit.title;
    ui.altarSpiritImage.src = spirit.image;
    ui.altarSpiritImage.alt = spirit.name;
    ui.altarSpiritCaption.textContent = spirit.name;
    ui.blessingSpiritHeading.textContent = `${spirit.name} ANSWERS`;
    ui.blessingSpiritImage.src = spirit.image;
    ui.blessingSpiritImage.alt = spirit.name;
    ui.blessingSpiritCaption.textContent = spirit.name;
  }

  function currentSpiritDialoguePage() {
    const pages = state.spirit.dialogue[state.spiritDialoguePhase] || [];
    return pages[state.spiritDialoguePage] || '';
  }

  function updateSpiritDialogueUI() {
    const text = currentSpiritDialoguePage();
    ui.spiritDialogueScreen.classList.toggle('line-complete', state.spiritDialogueLineComplete);
    ui.spiritDialogueName.textContent = state.spirit.dialogueName;
    ui.spiritDialoguePortrait.src = state.spirit.image;
    ui.spiritDialoguePortrait.alt = state.spirit.dialogueName;
    ui.spiritDialogueLine.textContent = state.spiritDialogueLineComplete
      ? text
      : text.slice(0, state.spiritDialogueRenderedChars);
  }

  function beginSpiritDialogue(phase, returnMode) {
    if (!['weak', 'restored'].includes(phase) || state.altarInteractionCompleted && phase === 'weak') return;
    if (phase === 'weak' && state.altarWeakDialogueShown) { setMode(returnMode); return; }
    if (phase === 'restored' && state.altarRestoredDialogueShown) { setMode(returnMode); return; }
    clearInput();
    state.spiritDialoguePhase = phase;
    state.spiritDialoguePage = 0;
    state.spiritDialogueTimer = 0;
    state.spiritDialogueRenderedChars = 0;
    state.spiritDialogueLineComplete = false;
    state.spiritDialogueReturnMode = returnMode;
    if (phase === 'weak' && !state.altarSoundPlayed) {
      state.altarSoundPlayed = true;
      playAltarSound(state.spirit.id);
    }
    setMode('spiritDialogue');
    updateSpiritDialogueUI();
  }

  function advanceSpiritDialogue() {
    if (state.mode !== 'spiritDialogue') return;
    const text = currentSpiritDialoguePage();
    if (!state.spiritDialogueLineComplete) {
      state.spiritDialogueLineComplete = true;
      state.spiritDialogueRenderedChars = text.length;
      updateSpiritDialogueUI();
      return;
    }
    const pages = state.spirit.dialogue[state.spiritDialoguePhase] || [];
    if (state.spiritDialoguePage + 1 < pages.length) {
      state.spiritDialoguePage++;
      state.spiritDialogueTimer = 0;
      state.spiritDialogueRenderedChars = 0;
      state.spiritDialogueLineComplete = false;
      updateSpiritDialogueUI();
      return;
    }
    if (state.spiritDialoguePhase === 'weak') state.altarWeakDialogueShown = true;
    if (state.spiritDialoguePhase === 'restored') state.altarRestoredDialogueShown = true;
    const returnMode = state.spiritDialogueReturnMode || 'altar';
    state.spiritDialoguePhase = null;
    state.spiritDialogueReturnMode = null;
    clearInput();
    if (returnMode === 'advance') advanceToNextStage();
    else setMode(returnMode);
    updateHUD();
  }

  function openAltarInteraction() {
    if (state.altarInteractionCompleted) return;
    state.player.x = WORLD.altarX;
    state.player.vy = 0;
    beginSpiritDialogue('weak', 'altar');
  }

  function offeringInfo() {
    const total = collectibleDefs.filter(item => item.type === 'breath').length;
    const prices = BLESSING_CONFIG.pricesByStage[activeStage.id] || BLESSING_CONFIG.pricesByStage[1];
    return {
      total,
      low: prices.low,
      high: prices.high
    };
  }

  function blessingDefinition(tier) {
    return BLESSING_CONFIG.spirits[state.spirit.id][tier];
  }

  function choiceStatus(tier) {
    const offering = offeringInfo();
    const spiritId = state.spirit.id;
    const price = tier === 'high' ? offering.high : offering.low;
    const unlocked = progression.permanent[spiritId];
    if (tier === 'low' && unlocked && spiritId !== 'macaw') return { available: false, price, reason: 'REPLACED BY JOURNEY BLESSING' };
    if (tier === 'high' && unlocked) return { available: false, price, reason: 'UNLOCKED THIS JOURNEY' };
    if (state.breath < price) return { available: false, price, reason: `NEEDS ${price} BREATH` };
    if (tier === 'high') {
      const target = offering.high;
      const projected = progression.offerings[spiritId] + price;
      if (projected < target) return { available: false, price, reason: `CUMULATIVE OFFERING ${progression.offerings[spiritId]}/${target}` };
    }
    return { available: true, price, reason: '' };
  }

  function purchasableChoices() {
    return ['low', 'high'].filter(tier => choiceStatus(tier).available);
  }

  function updateAltarOptions() {
    const offering = offeringInfo();
    const spiritId = state.spirit.id;
    const target = offering.high;
    const progressLabel = progression.permanent[spiritId]
      ? `${BLESSING_CONFIG.spirits[spiritId].high.name} unlocked for this journey.`
      : `${state.spirit.name} offered: ${progression.offerings[spiritId]}/${target}.`;
    ui.altarKicker.textContent = activeStage.id === 1 ? 'FIRST ALTAR' : activeStage.id === 2 ? 'SECOND ALTAR' : 'FINAL SPIRIT DWELLING';
    ui.altarBreath.textContent = state.breath;
    if (purchasableChoices().length === 0) {
      ui.altarRequirement.textContent = `Available: ${state.breath}. Low costs ${offering.low}; high costs ${offering.high}. ${progressLabel}`;
      ui.offerButton.textContent = activeStage.nextStage ? `CONTINUE TO STAGE ${activeStage.nextStage}` : 'COMPLETE JOURNEY';
    } else {
      ui.altarRequirement.textContent = `Available: ${state.breath}. Low costs ${offering.low} (this run); high costs ${offering.high} (journey upgrade at ${target} cumulative). ${progressLabel}`;
      ui.offerButton.textContent = 'CHOOSE OFFERING';
    }
  }

  function updateBlessingOptions() {
    const spiritId = state.spirit.id;
    const target = offeringInfo().high;
    ui.blessingProgress.textContent = `${state.breath} BREATH AVAILABLE · ${progression.offerings[spiritId]}/${target} OFFERED TO ${state.spirit.name}`;
    document.querySelectorAll('[data-tier]').forEach(button => {
      const tier = button.dataset.tier;
      const definition = blessingDefinition(tier);
      const status = choiceStatus(tier);
      button.disabled = !status.available || state.offeringBusy;
      const icon = button.querySelector('img');
      icon.src = BLESSING_CONFIG.spirits[spiritId][`${tier}Icon`];
      icon.alt = `${definition.name} icon`;
      button.querySelector('strong').textContent = definition.name;
      button.querySelector('small').textContent = `${definition.scope} · ${definition.description}`;
      button.querySelector('.blessing-cost').textContent = status.available ? `OFFER ${status.price} BREATH` : status.reason;
    });
  }

  function syncStageUI() {
    ui.stageLabel.textContent = activeStage.label;
    ui.stageStartArt.src = `assets/ui/STAGE_0${activeStage.id}_START.png`;
    ui.stageStartArt.alt = `Stage ${activeStage.id}: ${activeStage.name}`;
    const startButton = document.getElementById('start-button');
    startButton.setAttribute('aria-label', `Start Stage ${activeStage.id}`);
    document.title = `Riverbound — Stage ${activeStage.id}`;
    document.getElementById('game-shell').setAttribute('aria-label', `Riverbound Stage ${activeStage.id} game`);
  }

  function setMode(mode) {
    state.mode = mode;
    document.getElementById('game-shell').dataset.mode = mode;
    if (['cover', 'prologue', 'story', 'instructions', 'altar', 'spiritDialogue', 'dying', 'gameover', 'complete', 'title'].includes(mode)) fadeOutBgm();
    ['coverScreen','backgroundStoryScreen','titleScreen','instructionScreen','storyScreen','altarScreen','spiritDialogueScreen','blessingScreen','pauseScreen','endScreen'].forEach(k => ui[k].classList.add('hidden'));
    ui.hud.classList.toggle('hidden', ['cover','prologue','title','instructions','story'].includes(mode));
    const pauseAvailable = mode === 'running' || mode === 'paused';
    ui.pauseButton.classList.toggle('hidden', !pauseAvailable);
    ui.pauseButton.innerHTML = mode === 'paused'
      ? '<img src="assets/ui/08_PLAY_CONTINUE.png" alt="">'
      : '<img src="assets/ui/07_PAUSE.png" alt="">';
    ui.pauseButton.setAttribute('aria-label', mode === 'paused' ? 'Resume game' : 'Pause game');
    ui.pauseButton.title = mode === 'paused' ? 'Resume (Esc)' : 'Pause (Esc)';
    if (mode === 'cover') ui.coverScreen.classList.remove('hidden');
    if (mode === 'prologue') ui.backgroundStoryScreen.classList.remove('hidden');
    if (mode === 'title') ui.titleScreen.classList.remove('hidden');
    if (mode === 'instructions') ui.instructionScreen.classList.remove('hidden');
    if (mode === 'story') ui.storyScreen.classList.remove('hidden');
    if (mode === 'spiritDialogue') { updateSpiritUI(); updateSpiritDialogueUI(); ui.spiritDialogueScreen.classList.remove('hidden'); }
    if (['cover', 'prologue', 'story', 'instructions'].includes(mode)) resumeIntroBgm();
    else if (mode === 'running') { stopIntroBgm(); resumeBgm(); }
    else fadeOutIntroBgm();
    if (mode === 'altar') {
      updateSpiritUI(); updateAltarOptions(); ui.altarScreen.classList.remove('hidden');
      if (!state.altarSoundPlayed) { state.altarSoundPlayed = true; playAltarSound(state.spirit.id); }
    }
    if (mode === 'blessing') { updateSpiritUI(); updateBlessingOptions(); ui.blessingScreen.classList.remove('hidden'); }
    if (mode === 'paused') ui.pauseScreen.classList.remove('hidden');
    if (mode === 'complete' || mode === 'gameover') showEnd(mode);
  }

  function togglePause() {
    if (state.mode === 'running') {
      state.previousMode = 'running';
      clearInput();
      setMode('paused');
      updateHUD();
    } else if (state.mode === 'paused') {
      setMode(state.previousMode || 'running');
      updateHUD();
    }
  }

  function resetGame(startImmediately = false, stageNumber = activeStage.id, carry = {}) {
    activateStage(stageNumber);
    // Stage 1 is always the beginning of a new journey. Clear both saved and
    // in-memory blessings so their powers and HUD emblems cannot leak in from
    // a previous completion or a three-life game over. Explicit QA blessing
    // previews are isolated so the test screens remain usable.
    if (stageNumber === 1 && !startImmediately && !hasBlessingPreviewOverride()) {
      resetJourneyProgression();
      carry = {};
    }
    state = freshState(carry);
    if (qaHp) state.player.hp = qaHp;
    syncStageUI();
    clearInput();
    if (qaScreen === 'altar') {
      state.stageBreath = offeringInfo().total; state.breath = state.stageBreath;
      openAltarInteraction(); state.cameraX = Math.max(0, Math.min(WORLD.width - VIEW.width, WORLD.altarX - 360));
      updateHUD(); return;
    }
    if (qaScreen === 'blessing') {
      state.stageBreath = offeringInfo().total; state.breath = state.stageBreath; state.altarOffered = true;
      state.player.x = WORLD.altarX; state.cameraX = Math.max(0, Math.min(WORLD.width - VIEW.width, WORLD.altarX - 360));
      setMode('blessing'); updateHUD(); return;
    }
    if (qaScreen === 'instructions') { state.instructionsShown = true; setMode('instructions'); updateHUD(); return; }
    if (qaScreen === 'complete') { state.breath = 12; setMode('complete'); updateHUD(); return; }
    if (qaScreen === 'gameover') { state.breath = 4; setMode('gameover'); updateHUD(); return; }
    if (['frog', 'jaguar', 'macaw'].includes(qaBlessing)) applyLowBlessing(qaBlessing);
    if (qaAutoplay) {
      beginRun();
    } else if (activeStage.id === 1 && !startImmediately) {
      setMode('cover');
    } else {
      setMode('title');
    }
    updateHUD();
  }

  function leaveQaPreviewMode() {
    if (!qaAutoplay && !qaScreen && !qaBlessing && !qaSpirit && !qaPermanent && !qaProgress && !qaHealProgress && !qaHp && !qaParams.has('speed')) return;
    qaAutoplay = false;
    qaSimulationSteps = 1;
    qaBlessing = null;
    qaScreen = null;
    qaSpirit = null;
    qaPermanent = null;
    qaProgress = 0;
    qaHealProgress = 0;
    qaHp = 0;
    ['qa', 'speed', 'screen', 'blessing', 'spirit', 'progress', 'permanent', 'heal', 'hp'].forEach(key => qaParams.delete(key));
    const query = qaParams.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    clearInput();
  }

  function startStory() {
    clearInput();
    state.storyIndex = 0;
    state.storyTimer = 0;
    state.storyRenderedChars = 0;
    state.storyLineComplete = false;
    setMode('story');
    updateStoryUI();
  }
  function updateBackgroundStoryUI() {
    const entry = backgroundStory[backgroundStoryIndex];
    ui.backgroundStoryImage.src = entry.image;
    ui.backgroundStoryImage.alt = entry.alt;
    ui.backgroundStoryProgress.textContent = `${String(backgroundStoryIndex + 1).padStart(2, '0')} / ${String(backgroundStory.length).padStart(2, '0')}`;
    ui.backgroundStoryText.textContent = entry.text;
    ui.backgroundStoryImage.style.animation = 'none';
    void ui.backgroundStoryImage.offsetWidth;
    ui.backgroundStoryImage.style.animation = '';
  }
  function startBackgroundStory() {
    backgroundStoryShown = true;
    backgroundStoryIndex = 0;
    clearInput();
    setMode('prologue');
    updateBackgroundStoryUI();
  }
  function beginFromCover() {
    if (backgroundStoryShown) startStory();
    else startBackgroundStory();
  }
  function advanceBackgroundStory() {
    if (state.mode !== 'prologue') return;
    backgroundStoryIndex++;
    if (backgroundStoryIndex >= backgroundStory.length) {
      startStory();
      return;
    }
    updateBackgroundStoryUI();
  }
  function startPlayerJourney() {
    leaveQaPreviewMode();
    if (activeStage.id === 1 && !state.instructionsShown) {
      state.instructionsShown = true;
      clearInput();
      setMode('instructions');
      updateHUD();
      return;
    }
    beginPlayerRun();
  }
  function beginPlayerRun() {
    stopIntroBgm();
    startBgm();
    beginRun();
  }
  function continueFromInstructions() {
    if (state.mode !== 'instructions') return;
    beginPlayerRun();
  }
  function updateStoryUI() {
    const entry = openingDialogue[state.storyIndex];
    ui.storyScreen.classList.toggle('speaker-child', entry.side === 'child');
    ui.storyScreen.classList.toggle('speaker-grandmother', entry.side === 'grandmother');
    ui.storyScreen.classList.toggle('line-complete', state.storyLineComplete);
    ui.dialogueSpeaker.textContent = entry.speaker;
    ui.dialoguePortrait.src = entry.portrait;
    ui.dialoguePortrait.alt = entry.speaker === 'CHILD' ? 'The young guardian' : 'Grandmother';
    ui.dialogueBoxArt.src = entry.box;
    ui.storyLine.textContent = state.storyLineComplete ? entry.text : entry.text.slice(0, state.storyRenderedChars);
  }
  function advanceStory() {
    if (state.mode !== 'story') return;
    const entry = openingDialogue[state.storyIndex];
    if (!state.storyLineComplete) {
      state.storyLineComplete = true;
      state.storyRenderedChars = entry.text.length;
      updateStoryUI();
      return;
    }
    state.storyIndex++;
    if (state.storyIndex >= openingDialogue.length) {
      clearInput();
      startPlayerJourney();
      return;
    }
    state.storyTimer = 0;
    state.storyRenderedChars = 0;
    state.storyLineComplete = false;
    updateStoryUI();
  }
  function beginRun() { state.player.x = 220; state.player.y = WORLD.groundY - state.player.h; setMode('running'); }

  function carryToNextStage() {
    return {
      hp: state.player.hp, breath: state.breath, totem: state.player.totem,
      temp: { ...state.temp }, runBreathCollected: state.runBreathCollected,
      visitedSpiritIds: [...state.visitedSpiritIds]
    };
  }

  function advanceToNextStage() {
    if (activeStage.nextStage) {
      qaScreen = null;
      resetGame(true, activeStage.nextStage, carryToNextStage());
    }
    else {
      state.restored = true;
      setMode('complete');
      updateHUD();
    }
  }

  function offerAtAltar() {
    if (state.mode !== 'altar') return;
    state.altarOffered = true;
    if (purchasableChoices().length === 0) {
      advanceToNextStage();
      return;
    }
    setMode('blessing');
  }

  function applyLowBlessing(spiritId) {
    if (spiritId === 'frog') state.temp.frogShield = 1;
    if (spiritId === 'jaguar') state.temp.jaguarJumps = BLESSING_CONFIG.jaguar.temporaryAirJumps;
    if (spiritId === 'macaw') state.temp.macawMagnetTime = BLESSING_CONFIG.macaw.temporaryDuration;
  }

  function unlockPermanentBlessing(spiritId) {
    progression.permanent[spiritId] = true;
    if (spiritId === 'frog') {
      state.temp.frogShield = 0;
      state.player.renewableShieldReady = true;
      state.player.renewableShieldCooldown = 0;
    }
    if (spiritId === 'jaguar') state.temp.jaguarJumps = 0;
  }

  function chooseBlessing(tier) {
    if (state.mode !== 'blessing' || state.offeringBusy || !['low', 'high'].includes(tier)) return;
    const status = choiceStatus(tier);
    if (!status.available) return;
    state.offeringBusy = true;
    state.altarInteractionCompleted = true;
    state.altarOffered = true;
    const spiritId = state.spirit.id;
    const definition = blessingDefinition(tier);
    state.breath -= status.price;
    progression.offerings[spiritId] += status.price;
    if (tier === 'high') unlockPermanentBlessing(spiritId);
    else applyLowBlessing(spiritId);
    saveProgression();
    state.message = `ALTAR RESTORED · ${definition.name}`;
    state.messageTimer = 2;
    state.restored = true;
    state.restorationTimer = 2;
    spawnBurst(WORLD.altarX + 80, WORLD.groundY - 105, '#43ddd5', 24);
    updateHUD();
    setMode('restoring');
  }

  function showEnd(mode) {
    const complete = mode === 'complete';
    ui.endScreen.dataset.outcome = mode;
    ui.endArt.src = complete ? 'assets/ui/STAGE_COMPLETE_NO_STATS.png' : 'assets/ui/RUN_FAILED.png';
    ui.endEyebrow.textContent = complete ? activeStage.name : 'THE JOURNEY PAUSES';
    ui.endTitle.textContent = complete ? `STAGE ${activeStage.id} COMPLETE` : 'RUN ENDED';
    const finalStageComplete = complete && activeStage.id === 3;
    ui.endScreen.dataset.finalStage = String(finalStageComplete);
    ui.endStats.classList.toggle('hidden', !finalStageComplete);
    ui.endStats.innerHTML = finalStageComplete ? '<strong>THE BROKEN RIVER FLOWS AGAIN</strong><span>Hope returns to the rainforest.</span>' : '';
    const restartButton = document.getElementById('restart-button');
    restartButton.setAttribute('aria-label', finalStageComplete ? 'Return to village' : `Retry Stage ${activeStage.id} from the beginning`);
    restartButton.querySelector('span').textContent = finalStageComplete ? 'RETURN TO VILLAGE · R' : `RETRY STAGE ${activeStage.id} · R`;
    ui.endScreen.classList.remove('hidden');
  }

  function handleEndButton() {
    if (state.mode === 'complete') restartJourney();
    else retryCurrentStage();
  }

  function restartJourney() {
    leaveQaPreviewMode();
    qaParams.delete('stage');
    const query = qaParams.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    progression = loadProgression();
    resetGame(false, 1, {});
  }
  function retryCurrentStage() {
    leaveQaPreviewMode();
    const stageNumber = activeStage.id;
    const carry = {
      ...state.stageEntryCarry,
      hp: 3,
      temp: { ...state.stageEntryCarry.temp },
      visitedSpiritIds: [...state.stageEntryCarry.visitedSpiritIds]
    };
    resetGame(true, stageNumber, carry);
    beginRun();
    updateHUD();
  }

  function clearInput() { input.jump = false; input.jumpPressed = false; input.crouch = false; input.autoJumpKind = null; }
  function setJump(down) {
    if (down && !input.jump) input.jumpPressed = true;
    input.jump = down;
  }
  function setCrouch(down) { input.crouch = down; }

  function isPitAt(x) { return !platforms.some(platform => x >= platform.x && x <= platform.x + platform.w); }
  function rectsOverlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function playerRect() { return { x: state.player.x - state.player.w / 2, y: state.player.y, w: state.player.w, h: state.player.h }; }
  function obstacleCollisionRects(obstacle) {
    // The supplied vine art has a short left strand and a longer right strand.
    // Only the lower right half reaches a standing player's head.
    if (obstacle.type === 'vine') return [{ x: obstacle.x + 78, y: obstacle.y, w: obstacle.w - 78, h: Math.max(1, obstacle.h - 8) }];
    if (obstacle.type === 'log') {
      const fullX = obstacle.x - LOG_COLLISION_LEFT;
      const fullWidth = obstacle.w + LOG_COLLISION_LEFT + LOG_COLLISION_RIGHT;
      // The mossy left end is visual lead-in only. Start from the final two
      // thirds, then add half a player-width of entry grace so merely brushing
      // the root with the player's leading edge cannot cause damage.
      const activeWidth = fullWidth * LOG_COLLISION_ACTIVE_RATIO;
      const width = Math.max(1, activeWidth - LOG_COLLISION_ENTRY_GRACE);
      const x = fullX + fullWidth - activeWidth + LOG_COLLISION_ENTRY_GRACE;
      const bottom = obstacle.y + obstacle.h;
      const step = width / 3;
      const heights = [Math.max(42, obstacle.h - 18), obstacle.h + 8, obstacle.h + LOG_TILT_RISE];
      return heights.map((height, index) => ({
        x: x + step * index,
        y: bottom - height,
        w: index === heights.length - 1 ? width - step * index : step + 1,
        h: height
      }));
    }
    return [obstacle];
  }

  function validateStageConfig(config) {
    const issues = [];
    const supported = x => config.platforms.some(platform => x >= platform.x && x <= platform.x + platform.w);
    if (config.hasAltar) {
      const widestAltar = Math.max(210, ...Object.values(preRestorationAltarArt).map(art => art.width || 210));
      const altarCenter = config.world.altarX + 80;
      const edgeInset = 20;
      if (!supported(altarCenter - widestAltar / 2 - edgeInset) || !supported(altarCenter + widestAltar / 2 + edgeInset)) {
        issues.push(`Altar at ${config.world.altarX} is not fully supported by its platform`);
      }
    }
    for (const obstacle of config.obstacles) {
      const collisionRects = obstacleCollisionRects(obstacle);
      if (collisionRects.some(rect => !supported(rect.x) || !supported(rect.x + rect.w))) issues.push(`Obstacle at ${obstacle.x} crosses a platform edge`);
      if (obstacle.type === 'log' && obstacle.y + obstacle.h !== config.world.groundY) issues.push(`Log at ${obstacle.x} is not grounded`);
    }
    for (const item of config.collectibles) {
      const size = collectibleCollisionSize(item);
      const itemRect = { x: item.x - size / 2, y: item.y - size / 2, w: size, h: size };
      if (!supported(item.x)) issues.push(`Collectible at ${item.x} is not above a safe platform`);
      if (config.obstacles.some(obstacle => obstacleCollisionRects(obstacle).some(rect => rectsOverlap(itemRect, rect)))) {
        issues.push(`Collectible at ${item.x},${item.y} overlaps a hazard collider`);
      }
    }
    for (const checkpoint of config.checkpoints) if (!supported(checkpoint)) issues.push(`Checkpoint ${checkpoint} is over a pit`);
    return issues;
  }

  function tryStand() {
    const p = state.player;
    if (!p.crouching) return;
    const taller = { x: p.x - p.w / 2, y: p.y - 38, w: p.w, h: 76 };
    const blocked = obstacles.some(o => o.type === 'vine' && obstacleCollisionRects(o).some(rect => rectsOverlap(taller, rect)));
    if (!blocked) { p.y -= 38; p.h = 76; p.crouching = false; }
  }

  function applyCrouch() {
    const p = state.player;
    if (input.crouch && !p.crouching) { p.y += 38; p.h = 38; p.crouching = true; }
    if (!input.crouch) tryStand();
  }

  function performJump(power = PHYSICS.jump) {
    const p = state.player;
    p.vy = -power; p.grounded = false; p.coyote = 0; p.jumpBuffer = 0; p.jumpHold = 0;
    spawnBurst(p.x, p.y + p.h, '#b9ddd0', 7);
  }

  function updatePlayer(dt) {
    const p = state.player;
    applyCrouch();
    const horizontalSpeed = p.grounded ? (activeStage.runSpeed || PHYSICS.speed) : PHYSICS.speed * PHYSICS.airSpeedMultiplier;
    p.x += horizontalSpeed * dt;
    p.invuln = Math.max(0, p.invuln - dt);
    p.hurtFlash = Math.max(0, p.hurtFlash - dt);
    if (progression.permanent.frog && !p.renewableShieldReady && p.renewableShieldCooldown > 0) {
      p.renewableShieldCooldown = Math.max(0, p.renewableShieldCooldown - dt);
      if (p.renewableShieldCooldown === 0) {
        p.renewableShieldReady = true;
        state.message = 'UNDYING VENOM CLOAK RESTORED';
        state.messageTimer = 1.6;
        spawnBurst(p.x, p.y + 30, '#78dc7b', 12);
      }
    }
    p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
    if (input.jumpPressed) p.jumpBuffer = PHYSICS.buffer;

    if (p.grounded) {
      p.coyote = PHYSICS.coyote;
      p.airJumpAvailable = progression.permanent.jaguar || state.temp.jaguarJumps > 0;
      p.doubleJumpStarted = -Infinity;
    }
    else p.coyote = Math.max(0, p.coyote - dt);

    if (p.jumpBuffer > 0) {
      if (p.grounded || p.coyote > 0) performJump();
      else if (p.airJumpAvailable) {
        p.airJumpAvailable = false;
        if (!progression.permanent.jaguar) state.temp.jaguarJumps = Math.max(0, state.temp.jaguarJumps - 1);
        performJump(BLESSING_CONFIG.jaguar.secondJumpPower);
        p.doubleJumpStarted = state.time;
        state.message = 'JAGUAR AIR JUMP';
        state.messageTimer = .8;
        spawnBurst(p.x - 12, p.y + p.h, '#f3c755', 14);
      }
    }

    if (input.jump && p.vy < 0 && p.jumpHold < PHYSICS.maxHold) { p.vy -= PHYSICS.jumpHold * dt; p.jumpHold += dt; }
    if (!input.jump && p.vy < -260) p.vy += 1300 * dt;
    input.jumpPressed = false;

    const oldBottom = p.y + p.h;
    p.vy += PHYSICS.gravity * dt;
    p.y += p.vy * dt;
    const hasGround = !isPitAt(p.x);
    if (hasGround && p.vy >= 0 && p.y + p.h >= WORLD.groundY && oldBottom <= WORLD.groundY + 24) {
      p.y = WORLD.groundY - p.h; p.vy = 0; p.grounded = true;
    } else if (!hasGround || p.y + p.h < WORLD.groundY - 1) p.grounded = false;

    if (p.y > VIEW.height + 90) fallIntoPit();
  }

  function damage(reason, { force = false, source = 'obstacle' } = {}) {
    const p = state.player;
    if ((!force && p.invuln > 0) || state.mode !== 'running') return false;
    state.lastDamage = reason;
    state.damageEvents.push({ reason, x: Math.round(p.x) });
    if (source === 'obstacle' && progression.permanent.frog && p.renewableShieldReady) {
      p.renewableShieldReady = false;
      p.renewableShieldCooldown = BLESSING_CONFIG.frog.shieldCooldown;
      p.invuln = BLESSING_CONFIG.frog.shieldInvulnerability;
      state.message = 'UNDYING VENOM CLOAK BROKE · 20s COOLDOWN';
      state.messageTimer = 1.8;
      spawnBurst(p.x, p.y + 25, '#78dc7b', 20);
    } else if (source === 'obstacle' && state.temp.frogShield > 0) {
      state.temp.frogShield = 0;
      p.invuln = BLESSING_CONFIG.frog.shieldInvulnerability;
      state.message = 'VENOM CLOAK BLOCKED THE HIT';
      state.messageTimer = 1.8;
      spawnBurst(p.x, p.y + 25, '#78dc7b', 20);
    } else if (source === 'obstacle' && p.totem) {
      p.totem = false;
      p.invuln = 1;
      state.message = 'TOTEM BLOCKED THE HIT';
      state.messageTimer = 1.4;
      spawnBurst(p.x, p.y + 25, '#f3c755', 14);
    } else {
      p.hp--;
      playDamageSound();
      p.invuln = 1.05;
      p.hurtFlash = .28;
      state.message = reason;
      state.messageTimer = 1.2;
      spawnBurst(p.x, p.y + 25, '#ff736d', 12);
    }
    updateHUD();
    if (p.hp <= 0) {
      clearInput();
      p.dead = true;
      p.crouching = false;
      p.h = 76;
      p.vy = 0;
      p.grounded = true;
      p.y = WORLD.groundY - p.h;
      state.deathTimer = 1.25;
      setMode('dying');
      updateHUD();
    }
    return true;
  }

  function fallIntoPit() {
    // A pit is a discrete failure and must always resolve once, even if the
    // player entered it during the post-hit invulnerability window.
    damage('FELL INTO THE RAVINE', { force: true, source: 'pit' });
    if (state.mode !== 'running') return;
    const p = state.player;
    p.x = state.checkpoint; p.h = 76; p.crouching = false; p.y = WORLD.groundY - p.h; p.vy = 0; p.grounded = true;
    state.cameraX = Math.max(0, p.x - 360);
    state.rockfalls = [];
    state.rockfallTimer = 2.5;
    clearInput();
  }

  function updateObstacles() {
    const pr = playerRect();
    for (const obstacle of obstacles) {
      if (obstacleCollisionRects(obstacle).some(rect => rectsOverlap(pr, rect))) damage(`HIT · ${obstacle.label}`);
    }
  }

  function findRockfallTarget() {
    const playerX = state.player.x;
    const desired = playerX + ROCKFALL_CONFIG.targetLead + (Math.random() - .5) * ROCKFALL_CONFIG.targetJitter;
    const edgeMargin = 105;
    const candidates = platforms.filter(platform => {
      const left = platform.x + edgeMargin;
      const right = platform.x + platform.w - edgeMargin;
      return desired >= left && desired <= right && right > left;
    });
    for (const platform of candidates) {
      const x = desired;
      const tooCloseToObstacle = obstacles.some(obstacle => {
        const center = obstacle.x + obstacle.w / 2;
        return Math.abs(center - x) < 240;
      });
      if (!tooCloseToObstacle && x < WORLD.altarX - 560) return x;
    }
    return null;
  }

  function rockfallCollider(rock) {
    return {
      x: rock.x - ROCKFALL_CONFIG.colliderWidth / 2,
      y: rock.y + ROCKFALL_CONFIG.drawHeight - ROCKFALL_CONFIG.colliderHeight,
      w: ROCKFALL_CONFIG.colliderWidth,
      h: ROCKFALL_CONFIG.colliderHeight
    };
  }

  function updateRockfalls(dt) {
    if (activeStage.id < 2) return;
    state.rockfallTimer -= dt;
    if (state.rockfallTimer <= 0) {
      let spawned = false;
      if (state.player.x < WORLD.altarX - 700) {
        const targetX = findRockfallTarget();
        if (targetX != null) {
          state.rockfalls.push({
            x: targetX,
            y: -ROCKFALL_CONFIG.drawHeight - 24,
            phase: 'falling',
            landed: 0,
            rotation: (Math.random() - .5) * .16,
            spin: (Math.random() - .5) * .8,
            hit: false
          });
          spawned = true;
          playRockfallSound();
        }
      }
      state.rockfallTimer = spawned
        ? ROCKFALL_CONFIG.minInterval + Math.random() * (ROCKFALL_CONFIG.maxInterval - ROCKFALL_CONFIG.minInterval)
        : .65 + Math.random() * .35;
    }

    const pr = playerRect();
    for (const rock of state.rockfalls) {
      const landingY = WORLD.groundY - ROCKFALL_CONFIG.drawHeight + 8;
      if (rock.phase === 'falling') {
        rock.y += ROCKFALL_CONFIG.fallSpeed * dt;
        rock.rotation += rock.spin * dt;
        if (rock.y >= landingY) {
          rock.y = landingY;
          rock.phase = 'landed';
          rock.landed = ROCKFALL_CONFIG.landedTime;
          rock.rotation = 0;
          spawnBurst(rock.x, WORLD.groundY - 8, '#d6b06e', 8);
        }
      } else if (rock.phase === 'landed') {
        rock.landed -= dt;
        if (rock.landed <= 0) rock.phase = 'exiting';
      } else if (rock.phase === 'exiting') {
        rock.y += ROCKFALL_CONFIG.exitSpeed * dt;
        rock.rotation += 1.4 * dt;
      }
      if (!rock.hit && rock.phase === 'landed' && rectsOverlap(pr, rockfallCollider(rock))) {
        rock.hit = true;
        damage('HIT · FALLING ROCK', { source: 'obstacle' });
      }
    }
    state.rockfalls = state.rockfalls.filter(rock => rock.phase !== 'exiting' || rock.y < VIEW.height + 150);
  }

  function collectItem(item) {
    item.collected = true;
    if (item.type === 'breath') {
      state.breath++;
      state.stageBreath++;
      state.runBreathCollected++;
      playRiverBreathSound();
      state.message = item.bonus ? 'BONUS RIVER BREATH' : '+1 RIVER BREATH';
      spawnBurst(item.x, item.y, '#43ddd5', 9);
      if (progression.permanent.macaw) {
        progression.macawHealProgress++;
        if (progression.macawHealProgress >= BLESSING_CONFIG.macaw.healingInterval) {
          progression.macawHealProgress -= BLESSING_CONFIG.macaw.healingInterval;
          const healed = state.player.hp < state.player.maxHp;
          state.player.hp = Math.min(state.player.maxHp, state.player.hp + 1);
          state.message = healed ? 'LONG WIND RESTORED 1 LIFE' : 'LONG WIND CHARGE RELEASED';
          spawnBurst(state.player.x, state.player.y + 20, '#78dc7b', 18);
        }
        saveProgression();
      }
    }
    if (item.type === 'heart') {
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + 1);
      playHeartHealSound();
      state.message = 'HEALING HEART · +1 LIFE';
      spawnBurst(item.x, item.y, '#ff4e45', 12);
    }
    state.messageTimer = 1.1;
    updateHUD();
  }

  function activeMagnetRadius() {
    if (state.temp.macawMagnetTime > 0) return BLESSING_CONFIG.macaw.temporaryRadius;
    return progression.permanent.macaw ? BLESSING_CONFIG.macaw.permanentRadius : 0;
  }

  function collectibleCollisionSize(item) { return item.type === 'heart' ? 30 : 24; }

  function updateCollectibles(dt) {
    const pr = playerRect();
    for (const item of state.collectibles) {
      if (item.collected) continue;
      const size = collectibleCollisionSize(item);
      if (item.type === 'breath') {
        const radius = activeMagnetRadius();
        const targetY = state.player.y + state.player.h * .45;
        const dx = state.player.x - item.x;
        const dy = targetY - item.y;
        const distance = Math.hypot(dx, dy);
        if (radius > 0 && distance > 0 && distance <= radius) {
          if (!item.magnetized) { item.magnetized = true; spawnBurst(item.x, item.y, '#43ddd5', 3); }
          const travel = Math.min(distance, (440 + (radius - distance) * 2.2) * dt);
          item.x += dx / distance * travel;
          item.y += dy / distance * travel;
        }
      }
      if (rectsOverlap(pr, { x: item.x - size / 2, y: item.y - size / 2, w: size, h: size })) collectItem(item);
    }
  }

  function updateTutorials() {
    for (const t of state.tutorials) if (!t.shown && state.player.x >= t.x) { t.shown = true; state.message = t.text; state.messageTimer = 3.1; break; }
  }

  function updateCheckpoints() {
    for (const x of activeStage.checkpoints) if (state.player.x >= x && x > state.checkpoint) state.checkpoint = x;
  }

  function updateGame(dt) {
    state.time += dt;
    if (state.mode === 'story') {
      if (!state.storyLineComplete) {
        state.storyTimer += dt;
        const entry = openingDialogue[state.storyIndex];
        const nextCount = Math.min(entry.text.length, Math.floor(state.storyTimer * DIALOGUE_CHARACTERS_PER_SECOND));
        if (nextCount !== state.storyRenderedChars) {
          state.storyRenderedChars = nextCount;
          if (nextCount >= entry.text.length) state.storyLineComplete = true;
          updateStoryUI();
        }
      }
      return;
    }
    if (state.mode === 'spiritDialogue') {
      if (!state.spiritDialogueLineComplete) {
        state.spiritDialogueTimer += dt;
        const text = currentSpiritDialoguePage();
        const nextCount = Math.min(text.length, Math.floor(state.spiritDialogueTimer * DIALOGUE_CHARACTERS_PER_SECOND));
        if (nextCount !== state.spiritDialogueRenderedChars) {
          state.spiritDialogueRenderedChars = nextCount;
          if (nextCount >= text.length) state.spiritDialogueLineComplete = true;
          updateSpiritDialogueUI();
        }
      }
      return;
    }
    if (state.mode === 'restoring') {
      state.restorationTimer -= dt;
      state.messageTimer = Math.max(0, state.messageTimer - dt);
      updateParticles(dt);
      if (state.restorationTimer <= 0) beginSpiritDialogue('restored', 'advance');
      return;
    }
    if (state.mode === 'dying') {
      state.deathTimer = Math.max(0, state.deathTimer - dt);
      state.messageTimer = Math.max(0, state.messageTimer - dt);
      updateParticles(dt);
      if (state.deathTimer <= 0) setMode('gameover');
      return;
    }
    if (state.mode !== 'running') return;

    state.runTime += dt;
    if (qaAutoplay) updateAutoplayInput();
    state.temp.macawMagnetTime = Math.max(0, state.temp.macawMagnetTime - dt);
    updatePlayer(dt);
    updateObstacles();
    updateRockfalls(dt);
    updateCollectibles(dt);
    updateTutorials();
    updateCheckpoints();
    updateParticles(dt);
    state.messageTimer = Math.max(0, state.messageTimer - dt);

    if (activeStage.hasAltar && !state.altarOffered && state.player.x >= WORLD.altarX) {
      openAltarInteraction();
    } else if ((!activeStage.hasAltar || state.altarOffered) && state.player.x >= WORLD.finishX) advanceToNextStage();

    const targetCamera = Math.max(0, Math.min(WORLD.width - VIEW.width, state.player.x - 360));
    state.cameraX += (targetCamera - state.cameraX) * Math.min(1, dt * 5.5);
    updateHUD();
  }

  // Browser QA only. It is dormant for normal players and lets the fixed route
  // be exercised end-to-end even when an automation driver cannot hold keys.
  function updateAutoplayInput() {
    const p = state.player;
    const vine = obstacles.find(o => o.type === 'vine' && p.x > o.x - 180 && p.x < o.x + o.w + 42);
    input.crouch = Boolean(vine);
    if (qaRockfallHitTest && state.rockfalls.length) {
      input.crouch = false;
      input.jump = false;
      input.jumpPressed = false;
      return;
    }

    const jumpTarget = obstacles.find(o => {
      if (o.type !== 'log') return false;
      const collider = obstacleCollisionRects(o)[0];
      return collider.x - p.x > 0 && collider.x - p.x < 75;
    });
    const pitTarget = pits.find(gap => gap.x - p.x > 0 && gap.x - p.x < 42);
    const rockfallTarget = state.rockfalls.find(rock => {
      const distance = rock.x - p.x;
      return !qaRockfallHitTest && rock.phase !== 'warning' && rock.phase !== 'exiting' && distance > 0 && distance < 150;
    });
    const needsJump = Boolean(jumpTarget || pitTarget || rockfallTarget);
    if (needsJump && p.grounded && !input.jump) {
      input.autoJumpKind = jumpTarget ? 'log' : rockfallTarget ? 'rockfall' : 'pit';
      input.jumpPressed = true; input.jump = true;
    }
    if (input.jump && !p.grounded && ((input.autoJumpKind === 'pit' && p.jumpHold >= .07) || p.vy >= 0)) input.jump = false;
    if (p.grounded && !input.jump && !needsJump) input.autoJumpKind = null;

  }

  function spawnBurst(x, y, color, count) {
    for (let i = 0; i < count; i++) state.particles.push({ x, y, vx: (Math.random() - .5) * 180, vy: -40 - Math.random() * 160, life: .45 + Math.random() * .45, color });
  }
  function updateParticles(dt) {
    for (const p of state.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; p.life -= dt; }
    state.particles = state.particles.filter(p => p.life > 0);
  }

  function updateHUD() {
    if (!state) return;
    const shell = document.getElementById('game-shell');
    shell.dataset.stage = String(activeStage.id);
    shell.dataset.mode = state.mode;
    shell.dataset.playerX = String(Math.round(state.player.x));
    shell.dataset.hp = String(state.player.hp);
    shell.dataset.breath = String(state.breath);
    shell.dataset.stageBreath = String(state.stageBreath);
    shell.dataset.checkpoint = String(state.checkpoint);
    shell.dataset.configIssues = String(stageValidationIssues.length);
    shell.dataset.lastDamage = state.lastDamage;
    shell.dataset.damageEvents = state.damageEvents.map(event => `${event.reason}@${event.x}`).join('|');
    shell.dataset.platformArt = platforms.map(platform => platform.art).join(',');
    shell.dataset.runTime = state.runTime.toFixed(1);
    shell.dataset.spirit = state.spirit.id;
    shell.dataset.visitedSpirits = state.visitedSpiritIds.join(',');
    shell.dataset.temporaryFrogShield = String(state.temp.frogShield);
    shell.dataset.temporaryJaguarJumps = String(state.temp.jaguarJumps);
    shell.dataset.temporaryMacawSeconds = state.temp.macawMagnetTime.toFixed(1);
    shell.dataset.permanentBlessings = Object.entries(progression.permanent).filter(([, unlocked]) => unlocked).map(([id]) => id).join(',');
    shell.dataset.rockfallCount = String(state.rockfalls.length);
    shell.dataset.rockfallPhase = state.rockfalls[0]?.phase || '';
    shell.dataset.rockfallY = state.rockfalls[0] ? String(Math.round(state.rockfalls[0].y)) : '';
    const hpKey = `${state.player.hp}/${state.player.maxHp}`;
    if (ui.lifeValue.dataset.value !== hpKey) {
      ui.lifeValue.dataset.value = hpKey;
      ui.lifeValue.innerHTML = Array.from({ length: state.player.maxHp }, (_, index) =>
        `<img src="assets/ui/${index < state.player.hp ? '01_HEALTH_FULL' : '02_HEALTH_EMPTY'}.png" alt="${index < state.player.hp ? 'Full life' : 'Empty life'}">`
      ).join('');
    }
    ui.breathValue.textContent = state.breath;
    let shieldText = 'EMPTY';
    let shieldActive = state.player.totem;
    if (progression.permanent.frog) {
      shieldActive = state.player.renewableShieldReady || state.player.totem;
      shieldText = state.player.renewableShieldReady ? 'SHIELD READY' : `SHIELD ${Math.ceil(state.player.renewableShieldCooldown)}s${state.player.totem ? ' + TOTEM' : ''}`;
    } else if (state.temp.frogShield > 0) {
      shieldActive = true;
      shieldText = 'CLOAK 1';
    } else if (state.player.totem) shieldText = 'TOTEM READY';
    ui.totemValue.textContent = shieldText;
    ui.shieldIcon.classList.toggle('inactive', !shieldActive);
    const jumpActive = progression.permanent.jaguar || state.temp.jaguarJumps > 0;
    ui.jumpStatus.classList.toggle('hidden', !jumpActive);
    ui.jumpStatus.textContent = progression.permanent.jaguar ? 'AIR JUMP ∞' : `AIR JUMP ${state.temp.jaguarJumps}`;
    const magnetActive = progression.permanent.macaw || state.temp.macawMagnetTime > 0;
    ui.magnetStatus.classList.toggle('hidden', !magnetActive);
    ui.magnetStatus.textContent = state.temp.macawMagnetTime > 0 ? `MAGNET ${state.temp.macawMagnetTime.toFixed(1)}s` : 'MAGNET ∞';
    updateSpiritBlessingHUD();
    const progress = Math.max(0, Math.min(100, Math.round((state.player.x / WORLD.finishX) * 100)));
    ui.progressLabel.textContent = `${progress}%`; ui.progressFill.style.width = `${progress}%`;
  }

  function updateSpiritBlessingHUD() {
    document.querySelectorAll('.spirit-hud-icon').forEach(badge => {
      const spiritId = badge.dataset.spirit;
      const permanent = progression.permanent[spiritId];
      const temporary = spiritId === 'frog' ? state.temp.frogShield > 0
        : spiritId === 'jaguar' ? state.temp.jaguarJumps > 0
          : state.temp.macawMagnetTime > 0;
      const tier = permanent ? 'high' : temporary ? 'low' : null;
      badge.classList.toggle('active', Boolean(tier));
      badge.classList.toggle('permanent', permanent);
      const rankIcon = badge.querySelector('.spirit-rank-icon');
      if (tier) {
        const definition = BLESSING_CONFIG.spirits[spiritId][tier];
        rankIcon.src = BLESSING_CONFIG.spirits[spiritId][`${tier}Icon`];
        rankIcon.alt = `${definition.name} ${definition.scope}`;
        badge.setAttribute('aria-label', `${definition.name}, ${definition.scope}`);
        badge.title = `${definition.name} · ${definition.scope}`;
      } else {
        rankIcon.removeAttribute('src');
        rankIcon.alt = '';
        badge.setAttribute('aria-label', `${spiritId} blessing inactive`);
        badge.removeAttribute('title');
      }
    });
  }

  function drawBackground() {
    if (activeStage.id === 2) {
      drawNightBackground();
      return;
    }
    if (activeStage.id === 3) {
      drawStageThreeBackground();
      return;
    }
    const g = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    g.addColorStop(0, '#123b35'); g.addColorStop(.62, '#0b2b26'); g.addColorStop(1, '#041512');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    drawSceneryLayer('atmosphere');
    drawSceneryLayer('temple');
    drawSceneryLayer('jungle');
    drawAmbientFireflies();
    drawSceneryLayer('mist');
    drawSceneryLayer('water');
    drawSceneryLayer('riverDetail');
    const shade = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    shade.addColorStop(0, 'rgba(1, 12, 10, .1)'); shade.addColorStop(.6, 'rgba(1, 12, 10, .04)'); shade.addColorStop(1, 'rgba(1, 10, 8, .25)');
    ctx.fillStyle = shade; ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  function drawStageThreeBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    sky.addColorStop(0, '#51656b');
    sky.addColorStop(.58, '#9d8662');
    sky.addColorStop(1, '#503b2d');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    drawStageThreeLayer('sky', 1.04, 8);
    drawStageThreeLayer('mine', 1.055, 20);
    drawStageThreeLayer('forest', 1.07, 32);
    drawStageThreeLayer('river', 1.085, 44);
    drawStageThreeLayer('riverbank', 1.1, 56);

    const shade = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    shade.addColorStop(0, 'rgba(20, 22, 20, .04)');
    shade.addColorStop(.62, 'rgba(40, 25, 15, .02)');
    shade.addColorStop(1, 'rgba(18, 10, 7, .16)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  function drawStageThreeLayer(key, scale, pan, alpha = 1) {
    const image = stageThreeSceneryImages[key];
    if (!image?.complete || !image.naturalWidth) return;
    const progress = Math.max(0, Math.min(1, state.cameraX / Math.max(1, WORLD.finishX - VIEW.width)));
    const width = VIEW.width * scale;
    const height = VIEW.height * scale;
    const x = (VIEW.width - width) / 2 - (progress - .5) * pan;
    const y = (VIEW.height - height) / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(image, x, y, width, height);
    ctx.restore();
  }

  function drawNightBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    sky.addColorStop(0, '#02071d');
    sky.addColorStop(.48, '#071d48');
    sky.addColorStop(1, '#03142b');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    drawNightFullLayer('mountains', 1.12, 70, .92, 8);
    drawNightMoon();
    drawNightFullLayer('clouds', 1.1, 92, .38, -18);
    drawNightFullLayer('temple', 1.1, 118, .82, 2);
    drawNightFullLayer('canopy', 1.12, 158, .9, 14);
    drawNightWaterfall();
    drawNightFullLayer('treeLine', 1.14, 218, .88, 22);

    const water = ctx.createLinearGradient(0, NIGHT_WATERLINE, 0, VIEW.height);
    water.addColorStop(0, 'rgba(44, 125, 191, .28)');
    water.addColorStop(.38, 'rgba(9, 54, 106, .68)');
    water.addColorStop(1, 'rgba(2, 18, 51, .94)');
    ctx.fillStyle = water;
    ctx.fillRect(0, NIGHT_WATERLINE, VIEW.width, VIEW.height - NIGHT_WATERLINE);
    const riverSurface = supplementImages.riverSurface;
    if (riverSurface?.complete && riverSurface.naturalWidth) {
      ctx.save();
      ctx.globalAlpha = .58;
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(riverSurface, 0, NIGHT_RIVER_ART_OFFSET_Y, VIEW.width, VIEW.height);
      ctx.restore();
    }
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = 'rgba(114, 197, 255, .2)';
    ctx.lineWidth = 2;
    for (let row = 0; row < 5; row++) {
      const y = NIGHT_WATERLINE + 56 + row * 38;
      ctx.beginPath();
      for (let x = -20; x <= VIEW.width + 20; x += 24) {
        const waveY = y + Math.sin(x * .023 + state.time * .7 + row) * 3;
        if (x === -20) ctx.moveTo(x, waveY); else ctx.lineTo(x, waveY);
      }
      ctx.stroke();
    }
    ctx.restore();
    drawAmbientFireflies();
    ctx.fillStyle = 'rgba(1, 6, 25, .14)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  function drawNightFullLayer(key, scale, pan, alpha, yOffset = 0) {
    const image = nightSceneryImages[key];
    if (!image?.complete || !image.naturalWidth) return;
    const progress = Math.max(0, Math.min(1, state.cameraX / Math.max(1, WORLD.finishX - VIEW.width)));
    const width = VIEW.width * scale;
    const height = VIEW.height * scale;
    const x = (VIEW.width - width) / 2 - (progress - .5) * pan;
    const y = (VIEW.height - height) / 2 + yOffset;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(image, x, y, width, height);
    ctx.restore();
  }

  function drawNightMoon() {
    const image = nightSceneryImages.moon;
    if (!image?.complete || !image.naturalWidth) return;
    const progress = Math.max(0, Math.min(1, state.cameraX / Math.max(1, WORLD.finishX - VIEW.width)));
    const width = 310;
    const height = width * image.naturalHeight / image.naturalWidth;
    ctx.save();
    ctx.globalAlpha = .86;
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(image, 145 - progress * 42, 6, width, height);
    ctx.restore();
  }

  function drawNightWaterfall() {
    const image = nightSceneryImages.waterfall;
    if (!image?.complete || !image.naturalWidth) return;
    const progress = Math.max(0, Math.min(1, state.cameraX / Math.max(1, WORLD.finishX - VIEW.width)));
    const height = 570;
    const width = height * image.naturalWidth / image.naturalHeight;
    ctx.save();
    ctx.globalAlpha = .42;
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(image, 790 - progress * 165, 72, width, height);
    ctx.restore();
  }

  function drawBrokenRiverEnvironment() {
    const progress = Math.max(0, Math.min(1, state.cameraX / Math.max(1, WORLD.finishX - VIEW.width)));
    const damage = state.restored ? 0 : Math.max(0, (progress - .08) / .82);
    ctx.save();
    ctx.fillStyle = `rgba(82, 54, 31, ${.08 + damage * .24})`;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const water = ctx.createLinearGradient(0, 390, 0, VIEW.height);
    water.addColorStop(0, state.restored ? 'rgba(52, 222, 192, .18)' : `rgba(93, 75, 38, ${.08 + damage * .3})`);
    water.addColorStop(1, state.restored ? 'rgba(30, 181, 150, .28)' : `rgba(39, 32, 22, ${.18 + damage * .42})`);
    ctx.fillStyle = water;
    ctx.fillRect(0, 390, VIEW.width, VIEW.height - 390);

    // Distant cut trunks are narrative silhouettes only; hazards retain bright art and colliders.
    ctx.fillStyle = `rgba(47, 34, 24, ${.12 + damage * .42})`;
    for (const worldX of [3600, 4300, 5150, 6250, 7450, 8400, 9200]) {
      const x = worldX - state.cameraX * .42;
      if (x < -80 || x > VIEW.width + 80) continue;
      const height = 36 + (worldX % 4) * 8;
      ctx.fillRect(x - 13, 350 - height, 26, height);
      ctx.beginPath(); ctx.ellipse(x, 350 - height, 19, 7, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (state.restored) {
      ctx.fillStyle = 'rgba(90, 232, 128, .32)';
      for (let x = 50; x < VIEW.width; x += 95) {
        ctx.beginPath(); ctx.ellipse(x, 410, 18, 5, -.35, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawSceneryLayer(key) {
    const layer = scenery.find(item => item.key === key);
    const image = sceneryImages[key];
    if (!layer || !image?.complete || !image.naturalWidth) return;
    const height = VIEW.height * layer.scale;
    const width = image.naturalWidth * (height / image.naturalHeight);
    const y = (VIEW.height - height) / 2 + (layer.yOffset || 0);
    const offset = -((state.cameraX * layer.speed) % width);
    ctx.save();
    ctx.globalAlpha = layer.alpha;
    for (let x = offset - width; x < VIEW.width + width; x += width) ctx.drawImage(image, x, y, width, height);
    ctx.restore();
  }

  function drawAmbientFireflies() {
    const image = supplementImages.firefly;
    if (!image?.complete || !image.naturalWidth) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 12; i++) {
      const travel = state.cameraX * .3;
      const x = ((i * 163 - travel) % 1540 + 1540) % 1540 - 100;
      const y = 150 + ((i * 79) % 300) + Math.sin(state.time * 1.8 + i) * 8;
      const size = 14 + (i % 3) * 5;
      ctx.globalAlpha = .32 + (Math.sin(state.time * 2.6 + i) + 1) * .16;
      ctx.drawImage(image, 560, 450, 360, 360, x - size / 2, y - size / 2, size, size);
    }
    ctx.restore();
  }

  function worldToScreen(x) { return x - state.cameraX; }
  function drawWorld() {
    ctx.save();
    for (const o of obstacles) {
      const x = worldToScreen(o.x);
      if (o.type === 'log') drawLogObstacle(o, x);
      else drawVineObstacle(o, x);
    }

    drawAltar();
    drawCollectibles();
    drawForesightWarning();
    drawPlayer();
    drawRockfalls();
    drawParticles();
    ctx.restore();
  }

  function drawPlatformArt() {
    const rock = supplementImages.waterRock;
    for (const platform of platforms) {
      const x = worldToScreen(platform.x);
      if (x + platform.w < -80 || x > VIEW.width + 80) continue;
      const art = platformArt[platform.art];
      const image = platformImages[platform.art];
      if (!image?.complete || !image.naturalWidth) {
        ctx.fillStyle = '#163d33';
        ctx.fillRect(x, WORLD.groundY, platform.w, 180);
        continue;
      }
      const [sx, sy, sw, sh] = art.crop;
      const height = platform.w * sh / sw;
      const scale = platform.w / sw;
      const drawY = art.surfaceY == null ? WORLD.groundY - art.topInset : WORLD.groundY - art.surfaceY * scale;
      ctx.drawImage(image, sx, sy, sw, sh, x, drawY, platform.w, height);
    }

    for (const pit of pits) {
      const x = worldToScreen(pit.x);
      if (x < -250 || x > VIEW.width + 250) continue;
      if (rock?.complete && rock.naturalWidth && pit.w > 175) {
        ctx.globalAlpha = .82;
        ctx.drawImage(rock, 560, 420, 930, 470, x + pit.w / 2 - 48, WORLD.groundY + 105, 96, 49);
        ctx.globalAlpha = 1;
      }
    }
    if (activeStage.id === 2) {
      ctx.fillStyle = 'rgba(3, 21, 74, .14)';
      ctx.fillRect(0, WORLD.groundY - 18, VIEW.width, VIEW.height - WORLD.groundY + 18);
    }
  }

  function drawLogObstacle(obstacle, x) {
    const art = groundHazardArt[obstacle.groundHazard];
    const hazardImage = groundHazardImages[obstacle.groundHazard];
    if (art && hazardImage?.complete && hazardImage.naturalWidth) {
      const [sx, sy, sw, sh] = art.crop;
      const drawX = x + obstacle.w / 2 - art.width / 2;
      const drawY = WORLD.groundY - art.height + (art.groundSink ?? 3);
      ctx.drawImage(hazardImage, sx, sy, sw, sh, drawX, drawY, art.width, art.height);
      return;
    }
    const useFullGameplayLog = activeStage.id === 2;
    const image = useFullGameplayLog ? supplementImages.fullLog : supplementImages.log;
    const collisionRects = obstacleCollisionRects(obstacle);
    const drawX = worldToScreen(obstacle.x - LOG_VISUAL_PADDING);
    const drawWidth = obstacle.w + LOG_VISUAL_PADDING * 2;
    if (image?.complete && image.naturalWidth) {
      ctx.save();
      // Anchor the lower-left edge in the platform and lift the far end. The
      // taller collision box above mirrors the rotated silhouette.
      ctx.translate(drawX, WORLD.groundY + 14);
      ctx.rotate(LOG_TILT_RADIANS);
      if (useFullGameplayLog) {
        const crop = { x: 55, y: 255, w: 1580, h: 570 };
        const drawHeight = drawWidth * crop.h / crop.w;
        ctx.drawImage(image, crop.x, crop.y, crop.w, crop.h, 0, -drawHeight, drawWidth, drawHeight);
      } else {
        const drawHeight = drawWidth * image.naturalHeight / image.naturalWidth;
        ctx.drawImage(image, 0, -drawHeight, drawWidth, drawHeight);
      }
      ctx.restore();
    } else {
      ctx.fillStyle = '#a16f4c';
      collisionRects.forEach(rect => ctx.fillRect(worldToScreen(rect.x), rect.y, rect.w, rect.h));
    }
  }

  function drawVineObstacle(obstacle, x) {
    const image = supplementImages.vine;
    if (image?.complete && image.naturalWidth) {
      const vineWidth = 160;
      const vineBottom = obstacle.y + obstacle.h;
      ctx.drawImage(image, 455, 75, 360, 1170, x + obstacle.w / 2 - vineWidth / 2, -8, vineWidth, vineBottom + 8);
    } else {
      ctx.fillStyle = '#5f9c62'; ctx.fillRect(x, obstacle.y, obstacle.w, obstacle.h);
    }
  }

  function drawForeground() {
    if (activeStage.id === 2) {
      drawNightForeground();
      return;
    }
    if (activeStage.id === 3) {
      drawStageThreeLayer('foreground', 1.12, 72);
      return;
    }
    drawSceneryLayer('canopy');
  }

  function drawNightForeground() {
    ctx.save();
    ctx.globalAlpha = 1;
    const left = nightSceneryImages.leftFrame;
    const right = nightSceneryImages.rightFrame;
    if (left?.complete && left.naturalWidth) ctx.drawImage(left, 0, 0, VIEW.width, VIEW.height);
    if (right?.complete && right.naturalWidth) ctx.drawImage(right, 0, 0, VIEW.width, VIEW.height);
    const foliage = nightSceneryImages.bottomFoliage;
    if (foliage?.complete && foliage.naturalWidth) {
      ctx.globalAlpha = 1;
      ctx.drawImage(foliage, 0, 0, VIEW.width, VIEW.height);
    }
    ctx.restore();
  }

  function drawCollectibles() {
    for (const item of state.collectibles) {
      if (item.collected) continue;
      const x = worldToScreen(item.x); if (x < -40 || x > VIEW.width + 40) continue;
      const bob = Math.sin(state.time * 4 + item.id) * 5;
      if (item.type === 'heart' && healingHeartImage.complete && healingHeartImage.naturalWidth) {
        ctx.save();
        ctx.shadowBlur = 16;
        ctx.shadowColor = 'rgba(255, 78, 69, .8)';
        ctx.drawImage(healingHeartImage, 190, 270, 900, 760, x - 19, item.y - 18 + bob, 38, 34);
        ctx.restore();
      } else if (item.type === 'breath' && breathFrameImages.every(frame => frame.complete && frame.naturalWidth)) {
        const frame = breathFrameImages[Math.floor((state.time * 8 + item.id * .35) % breathFrameImages.length)];
        ctx.save(); ctx.globalCompositeOperation = 'screen';
        ctx.drawImage(frame, x - 16, item.y - 22 + bob, 32, 44);
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(x, item.y + bob, 12, 0, Math.PI * 2); ctx.fillStyle = item.type === 'breath' ? '#43ddd5' : '#ff4e45'; ctx.shadowBlur = 18; ctx.shadowColor = ctx.fillStyle; ctx.fill(); ctx.shadowBlur = 0;
      }
    }
  }

  function drawForesightWarning() {}

  function drawAltar() {
    if (!activeStage.hasAltar) return;
    const x = worldToScreen(WORLD.altarX + 80);
    if (x < -320 || x > VIEW.width + 320) return;
    const restored = state.restored;
    const art = restored ? restoredAltarArt[state.spirit.id] : preRestorationAltarArt[state.spirit.id];
    const image = restored ? restoredAltarImages[state.spirit.id] : preRestorationAltarImages[state.spirit.id];
    const width = art.width || 210;
    const height = width * art.crop[3] / art.crop[2];
    if (image?.complete && image.naturalWidth) {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = restored ? 18 : 10;
      ctx.shadowColor = restored ? 'rgba(67,221,213,.24)' : 'rgba(31,18,6,.45)';
      // Sink the exact visible stone-base edge slightly into the platform
      // foliage so no transparent gap can make the altar appear to float.
      const sink = restored ? ALTAR_GROUND_SINK.restored : ALTAR_GROUND_SINK.damaged;
      ctx.drawImage(image, ...art.crop, x - width / 2, WORLD.groundY - height + sink, width, height);
      ctx.restore();
    } else {
      ctx.fillStyle = restored ? '#614d28' : '#3d3a2f';
      ctx.fillRect(x - 60, WORLD.groundY - 90, 120, 90);
    }
  }

  function drawRockfalls() {
    for (const rock of state.rockfalls) {
      const x = worldToScreen(rock.x);
      if (x < -120 || x > VIEW.width + 120) continue;
      ctx.save();
      ctx.translate(x, rock.y + ROCKFALL_CONFIG.drawHeight / 2);
      ctx.rotate(rock.rotation);
      ctx.shadowBlur = 18;
      ctx.shadowColor = 'rgba(255, 157, 44, .35)';
      if (rockfallImage.complete && rockfallImage.naturalWidth) {
        ctx.drawImage(rockfallImage, 255, 75, 920, 1115,
          -ROCKFALL_CONFIG.drawWidth / 2, -ROCKFALL_CONFIG.drawHeight / 2,
          ROCKFALL_CONFIG.drawWidth, ROCKFALL_CONFIG.drawHeight);
      } else {
        ctx.fillStyle = '#8b7156';
        ctx.fillRect(-34, -42, 68, 84);
      }
      ctx.restore();
    }
  }

  function drawPlayer() {
    const p = state.player; const x = worldToScreen(p.x) - p.w / 2;
    if (p.dead) {
      const image = characterImages.death[0];
      const drawWidth = 122;
      const drawHeight = image?.naturalWidth ? drawWidth * image.naturalHeight / image.naturalWidth : 108;
      ctx.save();
      ctx.globalAlpha = .3;
      ctx.fillStyle = '#180706';
      ctx.beginPath();
      ctx.ellipse(worldToScreen(p.x), WORLD.groundY + 4, drawWidth * .43, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (image?.complete && image.naturalWidth) {
        ctx.drawImage(image, worldToScreen(p.x) - drawWidth / 2, WORLD.groundY - drawHeight + 7, drawWidth, drawHeight);
      } else {
        ctx.fillStyle = '#b9483f';
        ctx.fillRect(worldToScreen(p.x) - 45, WORLD.groundY - 24, 90, 24);
      }
      return;
    }
    if (p.invuln > 0 && p.hurtFlash <= 0 && Math.floor(p.invuln * 14) % 2 === 0) return;
    let animation = 'run';
    let frame = 0;
    if (p.crouching) animation = 'slide';
    else if (!p.grounded && state.time - p.doubleJumpStarted < .48) {
      animation = 'doubleJump';
      frame = Math.min(characterImages.doubleJump.length - 1, Math.floor((state.time - p.doubleJumpStarted) / .095));
    } else if (!p.grounded) {
      animation = 'jump';
      frame = p.vy < -220 ? 0 : p.vy < 220 ? 1 : 2;
    } else {
      frame = Math.floor(state.runTime * 12) % characterImages.run.length;
    }

    const image = characterImages[animation][frame];
    if (image?.complete && image.naturalWidth) {
      const scale = animation === 'run' ? .145 : .075;
      const drawW = image.naturalWidth * scale;
      const drawH = image.naturalHeight * scale;
      const pivotY = animation === 'run' ? image.naturalHeight * .892578125 : image.naturalHeight;
      const runBob = animation === 'run' ? Math.sin(state.time * 15) * 2 : 0;
      const footY = p.y + p.h + 3 + runBob;

      if (p.grounded) {
        ctx.save();
        ctx.globalAlpha = .26;
        ctx.fillStyle = '#03100d';
        ctx.beginPath();
        ctx.ellipse(worldToScreen(p.x), WORLD.groundY + 3, animation === 'slide' ? 48 : 31, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(worldToScreen(p.x), footY);
      if (animation === 'run') ctx.rotate(Math.sin(state.time * 15) * .012);
      if (progression.permanent.jaguar || state.temp.jaguarJumps > 0) {
        ctx.shadowBlur = 15;
        ctx.shadowColor = 'rgba(67,221,213,.7)';
      }
      if (p.hurtFlash > 0) {
        ctx.filter = 'sepia(1) saturate(11) hue-rotate(315deg) brightness(1.2)';
        ctx.shadowBlur = 20;
        ctx.shadowColor = 'rgba(255, 43, 43, .9)';
      }
      ctx.drawImage(image, -drawW * .5, -pivotY * scale, drawW, drawH);
      ctx.restore();

      return;
    }

    // Loading fallback keeps the game playable if a frame has not decoded yet.
    ctx.fillStyle = p.hurtFlash > 0 ? '#ff443d' : '#eef9ee'; ctx.fillRect(x, p.y, p.w, p.h);
    ctx.fillStyle = '#43ddd5'; ctx.fillRect(x + 7, p.y + 10, p.w - 14, 12);
  }

  function drawParticles() {
    for (const p of state.particles) { ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.color; ctx.fillRect(worldToScreen(p.x), p.y, 5, 5); }
    ctx.globalAlpha = 1;
  }

  function drawDebugColliders() {
    if (!state.debugColliders) return;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    const pr = playerRect();
    ctx.strokeStyle = '#65f6ff';
    ctx.strokeRect(worldToScreen(pr.x), pr.y, pr.w, pr.h);
    ctx.strokeStyle = '#ff5f6d';
    for (const obstacle of obstacles) {
      for (const rect of obstacleCollisionRects(obstacle)) ctx.strokeRect(worldToScreen(rect.x), rect.y, rect.w, rect.h);
    }
    for (const rock of state.rockfalls) {
      if (rock.phase !== 'landed') continue;
      const collider = rockfallCollider(rock);
      ctx.strokeRect(worldToScreen(collider.x), collider.y, collider.w, collider.h);
    }
    ctx.strokeStyle = '#f8e16c';
    for (const item of state.collectibles) {
      if (item.collected) continue;
      const size = collectibleCollisionSize(item);
      ctx.strokeRect(worldToScreen(item.x - size / 2), item.y - size / 2, size, size);
    }
    ctx.strokeStyle = '#9ef58d';
    for (const platform of platforms) ctx.strokeRect(worldToScreen(platform.x), WORLD.groundY - 3, platform.w, 6);
    ctx.restore();
  }

  function drawMessages() {
    if (state.messageTimer <= 0 || !['running', 'restoring'].includes(state.mode)) return;
    const alpha = Math.min(1, state.messageTimer * 2);
    ctx.globalAlpha = alpha; ctx.font = '800 17px sans-serif'; ctx.textAlign = 'center';
    const width = Math.min(700, ctx.measureText(state.message).width + 54);
    ctx.fillStyle = 'rgba(5,20,17,.84)'; ctx.fillRect((VIEW.width - width) / 2, 100, width, 44);
    ctx.strokeStyle = 'rgba(67,221,213,.45)'; ctx.strokeRect((VIEW.width - width) / 2, 100, width, 44);
    ctx.fillStyle = '#eef9ee'; ctx.fillText(state.message, VIEW.width / 2, 129); ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.clearRect(0, 0, VIEW.width, VIEW.height);
    drawBackground();
    drawPlatformArt();
    drawForeground();
    drawWorld();
    drawDebugColliders();
    drawMessages();
    if (state.mode === 'title') {
      ctx.fillStyle = 'rgba(67,221,213,.3)'; ctx.fillRect(0, WORLD.groundY - 6, VIEW.width, 6);
    }
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * dpr)); canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(canvas.width / VIEW.width, 0, 0, canvas.height / VIEW.height, 0, 0);
  }

  let lastTime = performance.now();
  function frame(now) {
    const dt = Math.min(.033, Math.max(0, (now - lastTime) / 1000)); lastTime = now;
    updateAudio(dt);
    for (let step = 0; step < qaSimulationSteps; step++) updateGame(dt);
    draw(); requestAnimationFrame(frame);
  }

  ui.coverScreen.addEventListener('click', beginFromCover);
  ui.backgroundStoryScreen.addEventListener('click', advanceBackgroundStory);
  document.getElementById('start-button').addEventListener('click', startPlayerJourney);
  ui.instructionScreen.addEventListener('click', continueFromInstructions);
  ui.storyScreen.addEventListener('click', advanceStory);
  ui.spiritDialogueScreen.addEventListener('click', advanceSpiritDialogue);
  ui.offerButton.addEventListener('click', offerAtAltar);
  document.querySelectorAll('[data-tier]').forEach(btn => btn.addEventListener('click', () => chooseBlessing(btn.dataset.tier)));
  document.getElementById('restart-button').addEventListener('click', handleEndButton);
  ui.pauseButton.addEventListener('click', togglePause);
  ui.musicButton.addEventListener('click', toggleMusic);
  document.querySelectorAll('button:not(.touch-button)').forEach(button => button.addEventListener('click', playUiClick));
  window.addEventListener('pointerdown', unlockGameAudio, { once: true, capture: true });
  window.addEventListener('keydown', unlockGameAudio, { once: true, capture: true });

  window.addEventListener('keydown', e => {
    const gameKey = ['Space','ArrowUp','ArrowDown','ControlLeft','ControlRight','Escape','KeyR','KeyB','Digit1','Digit2','Enter'].includes(e.code);
    if (gameKey) e.preventDefault();
    if (state.mode === 'cover' && (e.code === 'Enter' || e.code === 'Space') && !e.repeat) { beginFromCover(); return; }
    if (state.mode === 'prologue' && (e.code === 'Enter' || e.code === 'Space') && !e.repeat) { advanceBackgroundStory(); return; }
    if (state.mode === 'title' && (e.code === 'Enter' || e.code === 'Space') && !e.repeat) { startPlayerJourney(); return; }
    if (state.mode === 'instructions' && (e.code === 'Enter' || e.code === 'Space') && !e.repeat) { continueFromInstructions(); return; }
    if (state.mode === 'story' && (e.code === 'Enter' || e.code === 'Space') && !e.repeat) { advanceStory(); return; }
    if (state.mode === 'spiritDialogue' && (e.code === 'Enter' || e.code === 'Space') && !e.repeat) { advanceSpiritDialogue(); return; }
    if ((e.code === 'Space' || e.code === 'ArrowUp') && !e.repeat) setJump(true);
    if (e.code === 'ArrowDown' || e.code === 'ControlLeft' || e.code === 'ControlRight') setCrouch(true);
    if (e.code === 'Escape' && !e.repeat) togglePause();
    if (e.code === 'KeyR' && ['gameover','complete'].includes(state.mode)) handleEndButton();
    if (e.code === 'KeyB' && !e.repeat) state.debugColliders = !state.debugColliders;
    if (state.mode === 'altar' && (e.code === 'Enter' || e.code === 'Space')) offerAtAltar();
    if (state.mode === 'blessing' && e.code === 'Digit1') chooseBlessing('low');
    if (state.mode === 'blessing' && e.code === 'Digit2') chooseBlessing('high');
  }, { passive: false });
  window.addEventListener('keyup', e => {
    if (['Space','ArrowUp','ArrowDown','ControlLeft','ControlRight'].includes(e.code)) e.preventDefault();
    if (e.code === 'Space' || e.code === 'ArrowUp') setJump(false);
    if (e.code === 'ArrowDown' || e.code === 'ControlLeft' || e.code === 'ControlRight') setCrouch(false);
  }, { passive: false });
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', () => { clearInput(); lastTime = performance.now(); });
  window.addEventListener('resize', resizeCanvas);

  function bindTouch(el, setter) {
    const down = e => { e.preventDefault(); el.classList.add('pressed'); setter(true); };
    const up = e => { e.preventDefault(); el.classList.remove('pressed'); setter(false); };
    el.addEventListener('pointerdown', down); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
  }
  bindTouch(ui.touchJump, setJump); bindTouch(ui.touchCrouch, setCrouch);

  window.__riverbound = {
    getState: () => ({
      stage: activeStage.id, mode: state.mode, x: Math.round(state.player.x), hp: state.player.hp,
      breath: state.breath, stageBreath: state.stageBreath, totem: state.player.totem, spirit: state.spirit.id,
      visitedSpirits: [...state.visitedSpiritIds],
      temporary: { ...state.temp }, permanent: { ...progression.permanent }, offerings: { ...progression.offerings },
      renewableShieldReady: state.player.renewableShieldReady, renewableShieldCooldown: state.player.renewableShieldCooldown,
      macawHealProgress: progression.macawHealProgress, crouching: state.player.crouching,
      checkpoint: state.checkpoint, debugColliders: state.debugColliders, configIssues: [...stageValidationIssues],
      rockfalls: state.rockfalls.map(rock => ({ x: Math.round(rock.x), y: Math.round(rock.y), phase: rock.phase, hit: rock.hit }))
    }),
    restart: retryCurrentStage,
    startStage: stageNumber => {
      const requested = Number(stageNumber);
      resetGame(true, [1, 2, 3].includes(requested) ? requested : 1);
    },
    toggleDebugColliders: () => { state.debugColliders = !state.debugColliders; return state.debugColliders; }
  };

  updateMusicButton();
  activateStage(qaStage);
  resetGame(false, qaStage); resizeCanvas(); requestAnimationFrame(frame);
})();
