import type Phaser from "phaser";
import {
  GENDERS,
  NICKNAME_MAX_LENGTH,
  OUTFITS,
  PIN_PATTERN,
  bodyIdOf,
  checkNicknameFormat,
  normalizeNickname,
  type Appearance,
  type Gender,
} from "@park/shared";
import { CHARACTER, bodySheet, idleFrame, outfitSheet } from "../assets";
import { t, type MessageKey } from "../i18n";
import { checkNickname, fetchRandomNickname } from "../net/api";
import type { Profile } from "../profile";
import "./lobby.css";

/** login: 이미 만든 계정으로 들어가기, signup: 새 계정 만들고 들어가기 */
export type LobbyMode = "login" | "signup";

export interface LobbyValues {
  mode: LobbyMode;
  nickname: string;
  pin: string;
  /** 가입이면 항상, 로그인이면 '캐릭터 바꾸기'를 열었을 때만 */
  appearance?: Appearance;
}

/** 입력 중 닉네임 확인 요청을 보내기까지 기다리는 시간 */
const CHECK_DEBOUNCE_MS = 400;
/** 미리보기: 걷기 프레임 간격, 한 방향으로 걷는 프레임 수 */
const PREVIEW_FRAME_MS = 1000 / CHARACTER.rows[0].frameRate;
const PREVIEW_FRAMES_PER_FACING = 8;
/** 시계 방향으로 한 바퀴 돈다 */
const PREVIEW_FACINGS = ["down", "down-left", "left", "up-left", "up", "up-right", "right", "down-right"] as const;
const PREVIEW_SCALE = 3;

/**
 * 입장 화면 입력 폼. 글자 입력은 Phaser 보다 HTML 이 다루기 쉬워서 DOM 으로 만든다.
 * - 로그인: 닉네임 + PIN. 캐릭터는 저장된 것 그대로 ('캐릭터 바꾸기'를 열면 바꿀 수 있음)
 * - 처음이에요: 닉네임(추천) + PIN 두 번 + 캐릭터
 * 캐릭터 미리보기는 Phaser 가 불러 둔 스프라이트시트를 <canvas> 에 몸 → 옷 순서로 겹쳐 그린다.
 */
export class LobbyForm {
  private readonly form: HTMLFormElement;
  private readonly tabs: Record<LobbyMode, HTMLButtonElement>;
  private readonly nickname: HTMLInputElement;
  private readonly random: HTMLButtonElement;
  private readonly pin: HTMLInputElement;
  private readonly pinConfirmField: HTMLElement;
  private readonly pinConfirm: HTMLInputElement;
  private readonly pinHint: HTMLElement;
  private readonly nicknameHint: HTMLElement;
  private readonly characterBox: HTMLElement;
  private readonly changeCharacter: HTMLButtonElement;
  private readonly error: HTMLElement;
  private readonly submit: HTMLButtonElement;
  private readonly genderBox: HTMLElement;
  private readonly outfitBox: HTMLElement;
  private readonly preview: CanvasRenderingContext2D;
  private mode: LobbyMode;
  /** 로그인 모드에서 '캐릭터 바꾸기'를 열었는지 */
  private characterOpen = false;
  private gender: Gender;
  private outfit: string;
  private busy = false;
  private previewTick = 0;
  private readonly previewTimer: number;
  private checkTimer?: number;
  private checkAbort?: AbortController;

  constructor(
    private readonly textures: Phaser.Textures.TextureManager,
    initial: Profile,
    private readonly onSubmit: (values: LobbyValues) => Promise<void>,
  ) {
    this.gender = initial.gender;
    this.outfit = initial.outfit;
    // 이 브라우저에서 들어간 적이 있으면 로그인, 아니면 가입부터
    this.mode = initial.nickname ? "login" : "signup";

    this.form = document.createElement("form");
    this.form.className = "lobby";
    this.form.noValidate = true;
    this.form.innerHTML = `
      <h1 class="lobby-title"></h1>
      <p class="lobby-tagline"></p>
      <div class="lobby-tabs" role="tablist">
        <button type="button" role="tab" data-mode="login"></button>
        <button type="button" role="tab" data-mode="signup"></button>
      </div>
      <label class="lobby-field">
        <span data-text="nickname"></span>
        <span class="lobby-row">
          <input name="nickname" autocomplete="username" spellcheck="false" />
          <button type="button" class="lobby-random"></button>
        </span>
      </label>
      <p class="lobby-hint" data-role="nickname-hint"></p>
      <label class="lobby-field">
        <span data-text="pin"></span>
        <input name="pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="4" />
      </label>
      <label class="lobby-field" data-role="pin-confirm">
        <span data-text="pinConfirm"></span>
        <input name="pinConfirm" type="password" inputmode="numeric" autocomplete="new-password" maxlength="4" />
      </label>
      <p class="lobby-hint" data-role="pin-hint"></p>
      <button type="button" class="lobby-link" data-role="change-character"></button>
      <div class="lobby-character" data-role="character">
        <canvas class="lobby-preview" width="${CHARACTER.frameWidth * PREVIEW_SCALE}" height="${CHARACTER.frameHeight * PREVIEW_SCALE}"></canvas>
        <div class="lobby-choices">
          <div class="lobby-gender" role="radiogroup"></div>
          <div class="lobby-outfits" role="radiogroup"></div>
        </div>
      </div>
      <p class="lobby-error" role="alert"></p>
      <button type="submit" class="lobby-enter"></button>
      <p class="lobby-privacy"></p>`;

    const $ = <T extends Element>(sel: string) => this.form.querySelector(sel) as T;
    $<HTMLElement>(".lobby-title").textContent = t("app.title");
    $<HTMLElement>(".lobby-tagline").textContent = t("app.tagline");
    $<HTMLElement>('[data-text="nickname"]').textContent = t("lobby.nickname");
    $<HTMLElement>('[data-text="pin"]').textContent = t("lobby.pin");
    $<HTMLElement>('[data-text="pinConfirm"]').textContent = t("lobby.pinConfirm");
    $<HTMLElement>(".lobby-privacy").textContent = t("lobby.privacy");

    this.tabs = { login: $('[data-mode="login"]'), signup: $('[data-mode="signup"]') };
    this.tabs.login.textContent = t("lobby.tabLogin");
    this.tabs.signup.textContent = t("lobby.tabSignup");
    this.random = $(".lobby-random");
    this.random.textContent = t("lobby.randomNickname");
    this.random.title = t("lobby.randomNicknameTitle");

    this.nickname = $("input[name=nickname]");
    this.nickname.placeholder = t("lobby.nicknamePlaceholder");
    // 띄어쓰기를 몇 칸 더 쳐도 정리되므로 입력 칸은 조금 여유 있게
    this.nickname.maxLength = NICKNAME_MAX_LENGTH + 4;
    this.nickname.value = initial.nickname;
    this.pin = $("input[name=pin]");
    this.pinConfirmField = $('[data-role="pin-confirm"]');
    this.pinConfirm = $("input[name=pinConfirm]");
    this.pinHint = $('[data-role="pin-hint"]');
    this.nicknameHint = $('[data-role="nickname-hint"]');
    this.characterBox = $('[data-role="character"]');
    this.changeCharacter = $('[data-role="change-character"]');
    this.error = $(".lobby-error");
    this.submit = $(".lobby-enter");
    this.genderBox = $(".lobby-gender");
    this.outfitBox = $(".lobby-outfits");
    const canvas = $<HTMLCanvasElement>(".lobby-preview");
    this.preview = canvas.getContext("2d")!;
    this.preview.imageSmoothingEnabled = false;

    for (const mode of ["login", "signup"] as const) {
      this.tabs[mode].addEventListener("click", () => {
        if (!this.busy) this.setMode(mode);
      });
    }
    this.nickname.addEventListener("input", () => this.scheduleNicknameCheck());
    for (const input of [this.pin, this.pinConfirm]) {
      input.addEventListener("input", () => {
        input.value = input.value.replace(/\D/g, "").slice(0, 4);
      });
    }
    this.random.addEventListener("click", () => void this.suggestNickname());
    this.changeCharacter.addEventListener("click", () => {
      this.characterOpen = !this.characterOpen;
      this.render();
    });
    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.handleSubmit();
    });

    document.body.appendChild(this.form);
    this.renderChoices();
    this.render();
    this.previewTimer = window.setInterval(() => this.drawPreview(), PREVIEW_FRAME_MS);
    if (this.nickname.value) {
      this.scheduleNicknameCheck(0);
      this.pin.focus();
    } else {
      this.nickname.focus();
    }
  }

  destroy(): void {
    window.clearInterval(this.previewTimer);
    window.clearTimeout(this.checkTimer);
    this.checkAbort?.abort();
    this.form.remove();
  }

  /** 탭 전환. 가입은 됐는데 채널 접속이 실패한 경우 입장 화면이 로그인으로 바꿀 때도 쓴다 */
  setMode(mode: LobbyMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.showError("");
    this.pinConfirm.value = "";
    this.render();
    this.scheduleNicknameCheck(0);
    (this.nickname.value ? this.pin : this.nickname).focus();
  }

  /** 모드에 따라 보이는 칸·문구를 바꾼다 */
  private render(): void {
    const signup = this.mode === "signup";
    for (const mode of ["login", "signup"] as const) this.tabs[mode].setAttribute("aria-selected", String(mode === this.mode));
    this.random.hidden = !signup;
    this.pinConfirmField.hidden = !signup;
    this.pinHint.textContent = signup ? t("lobby.pinHintSignup") : "";
    this.pin.autocomplete = signup ? "new-password" : "current-password";
    this.changeCharacter.hidden = signup;
    this.changeCharacter.textContent = this.characterOpen ? t("lobby.keepCharacter") : t("lobby.changeCharacter");
    this.characterBox.hidden = !signup && !this.characterOpen;
    this.setBusy(this.busy);
  }

  private renderChoices(): void {
    this.genderBox.replaceChildren(
      ...GENDERS.map((g) =>
        this.choiceButton(t(`character.gender.${g}`), g === this.gender, () => {
          if (g === this.gender) return;
          this.gender = g;
          this.outfit = OUTFITS[g][0]!;
          this.renderChoices();
        }),
      ),
    );
    this.outfitBox.replaceChildren(
      ...OUTFITS[this.gender].map((o) =>
        this.choiceButton(t(`character.outfit.${o}` as MessageKey), o === this.outfit, () => {
          this.outfit = o;
          this.renderChoices();
        }),
      ),
    );
    this.drawPreview();
  }

  private choiceButton(label: string, selected: boolean, onClick: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "lobby-choice";
    b.textContent = label;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(selected));
    b.addEventListener("click", onClick);
    return b;
  }

  /** 몸 → 옷 순서로 같은 프레임을 겹쳐 그린다. 여덟 방향을 돌아가며 걷는다 */
  private drawPreview(): void {
    const tick = this.previewTick++;
    const facing = PREVIEW_FACINGS[Math.floor(tick / PREVIEW_FRAMES_PER_FACING) % PREVIEW_FACINGS.length]!;
    const frame = idleFrame(facing) + (tick % CHARACTER.framesPerRow);
    const ctx = this.preview;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (const key of [bodySheet(bodyIdOf({ gender: this.gender, outfit: this.outfit })).key, outfitSheet(this.outfit).key]) {
      const f = this.textures.getFrame(key, frame);
      if (!f) continue;
      ctx.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, ctx.canvas.width, ctx.canvas.height);
    }
  }

  /**
   * 입력이 멈추면 형식을 확인하고, 서버에 있는 닉네임인지 물어본다.
   * 가입: 이미 있으면 안내. 로그인: 없으면 안내.
   */
  private scheduleNicknameCheck(delay = CHECK_DEBOUNCE_MS): void {
    window.clearTimeout(this.checkTimer);
    this.checkAbort?.abort();
    this.setHint("");
    const name = normalizeNickname(this.nickname.value);
    if (!name) return;
    const mode = this.mode;
    this.checkTimer = window.setTimeout(async () => {
      const formatError = checkNicknameFormat(name);
      if (formatError) return this.setHint(t(`error.${formatError}`), true);
      this.checkAbort = new AbortController();
      try {
        const { exists } = await checkNickname(name, this.checkAbort.signal);
        if (mode === "signup") this.setHint(exists ? t("error.NICKNAME_TAKEN") : t("lobby.nicknameAvailable"), exists);
        else if (!exists) this.setHint(t("error.NICKNAME_NOT_FOUND"), true);
      } catch (err) {
        // 금지어 등 서버만 아는 오류는 보여 주고, 연결 문제는 조용히 넘어간다 (들어가기 누를 때 다시 안내)
        const code = (err as { code?: string }).code;
        if (code === "NICKNAME_BANNED") this.setHint(t("error.NICKNAME_BANNED"), true);
      }
    }, delay);
  }

  private setHint(text: string, isError = false): void {
    this.nicknameHint.textContent = text;
    this.nicknameHint.classList.toggle("is-error", isError);
  }

  private async suggestNickname(): Promise<void> {
    try {
      this.nickname.value = await fetchRandomNickname();
      this.scheduleNicknameCheck(0);
      this.pin.focus();
    } catch {
      this.showError(t("error.NETWORK"));
    }
  }

  private async handleSubmit(): Promise<void> {
    if (this.busy) return;
    const nickname = normalizeNickname(this.nickname.value);
    const pin = this.pin.value;
    const formatError = checkNicknameFormat(nickname);
    if (formatError) {
      this.showError(t(`error.${formatError}`));
      return this.nickname.focus();
    }
    if (!PIN_PATTERN.test(pin)) {
      this.showError(t("error.PIN_FORMAT"));
      return this.pin.focus();
    }
    if (this.mode === "signup" && this.pinConfirm.value !== pin) {
      this.showError(t("error.PIN_MISMATCH"));
      return this.pinConfirm.focus();
    }

    const sendAppearance = this.mode === "signup" || this.characterOpen;
    this.showError("");
    this.setBusy(true);
    try {
      await this.onSubmit({
        mode: this.mode,
        nickname,
        pin,
        appearance: sendAppearance ? { gender: this.gender, outfit: this.outfit } : undefined,
      });
    } catch (err) {
      this.showError(err instanceof Error ? err.message : String(err));
      this.setBusy(false);
      this.pin.select();
    }
  }

  private showError(text: string): void {
    this.error.textContent = text;
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.submit.disabled = busy;
    this.submit.textContent = busy ? t("lobby.entering") : t(this.mode === "signup" ? "lobby.signupEnter" : "lobby.enter");
  }
}
