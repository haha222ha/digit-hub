import { api, setSession } from "../api.js";
import { el, flash } from "../ui.js";
import { navigate, linkClick } from "../router.js";

function authShell(title, sub, formNode, footerLinks) {
  return el("div", { className: "auth-screen" }, [
    el("aside", { className: "auth-brand" }, [
      el("img", { className: "mark", src: "/images/logo.svg", alt: "心象测" }),
      el("h1", { text: "心象测" }),
      el("p", {
        text: "商家工作台：生成测试链接、管理额度。忘记密码可用授权码找回，无需邮箱。",
      }),
    ]),
    el("section", { className: "auth-panel" }, [
      el("div", { className: "auth-card" }, [
        el("h2", { text: title }),
        el("p", { className: "sub", text: sub }),
        formNode,
        el("div", { className: "auth-links" }, footerLinks),
      ]),
    ]),
  ]);
}

export function renderLogin(root) {
  const modeHost = el("div", { className: "mode-tabs" });
  const formHost = el("div");
  let mode = "password";

  function paint() {
    modeHost.replaceChildren(
      el("button", {
        type: "button",
        className: `mode-tab${mode === "password" ? " active" : ""}`,
        text: "账号密码",
        onClick: () => {
          mode = "password";
          paint();
        },
      }),
      el("button", {
        type: "button",
        className: `mode-tab${mode === "code" ? " active" : ""}`,
        text: "授权码登录",
        onClick: () => {
          mode = "code";
          paint();
        },
      })
    );

    const errHost = el("div");
    const box = el("form");
    if (mode === "password") {
      const user = el("input", { type: "text", autocomplete: "username", required: "true" });
      const pass = el("input", { type: "password", autocomplete: "current-password", required: "true" });
      const btn = el("button", { className: "btn btn-primary", type: "submit", text: "登录" });
      box.append(
        errHost,
        el("div", { className: "field" }, [el("label", { text: "用户名" }), user]),
        el("div", { className: "field" }, [el("label", { text: "密码" }), pass]),
        btn
      );
      box.addEventListener("submit", async (e) => {
        e.preventDefault();
        errHost.replaceChildren();
        btn.disabled = true;
        try {
          const data = await api.login(user.value.trim(), pass.value);
          setSession(data.token, data.user);
          navigate("/admin/dashboard", { replace: true });
        } catch (err) {
          errHost.append(flash("error", err.message || "登录失败"));
        } finally {
          btn.disabled = false;
        }
      });
    } else {
      const code = el("input", { required: "true", autocomplete: "off", placeholder: "已绑定账号的授权码/额度码" });
      const btn = el("button", { className: "btn btn-primary", type: "submit", text: "授权码登录" });
      box.append(
        errHost,
        el("p", {
          className: "muted",
          text: "使用你兑换过的额度授权码登录。登录后请到「账户」修改密码。",
        }),
        el("div", { className: "field" }, [el("label", { text: "授权码" }), code]),
        btn
      );
      box.addEventListener("submit", async (e) => {
        e.preventDefault();
        errHost.replaceChildren();
        btn.disabled = true;
        try {
          const data = await api.loginCode(code.value.trim());
          setSession(data.token, data.user);
          navigate("/admin/account-settings?from=code", { replace: true });
        } catch (err) {
          errHost.append(flash("error", err.message || "授权码登录失败"));
        } finally {
          btn.disabled = false;
        }
      });
    }
    formHost.replaceChildren(box);
  }

  paint();
  const wrap = el("div", {}, [modeHost, formHost]);
  root.append(
    authShell("登录工作台", "支持账号密码，或授权码登录后改密。", wrap, [
      el("a", { href: "/register", text: "注册账号", onClick: (e) => linkClick(e, "/register") }),
      el("a", {
        href: "/reset-password",
        text: "忘记密码",
        onClick: (e) => linkClick(e, "/reset-password"),
      }),
      el("a", { href: "/", text: "首页" }),
    ])
  );
}

export function renderRegister(root) {
  const box = el("form");
  const errHost = el("div");
  const username = el("input", { required: "true", minlength: "3", maxlength: "50", autocomplete: "username" });
  const password = el("input", {
    type: "password",
    required: "true",
    minlength: "6",
    autocomplete: "new-password",
  });
  const invite = el("input", { autocomplete: "off" });
  const btn = el("button", { className: "btn btn-primary", type: "submit", text: "创建账号" });

  box.append(
    errHost,
    el("p", { className: "muted", text: "无需绑定邮箱。忘记密码时，用已兑换的授权码即可找回并改密。" }),
    el("div", { className: "field" }, [el("label", { text: "用户名（3–50 字）" }), username]),
    el("div", { className: "field" }, [el("label", { text: "密码（至少 6 位）" }), password]),
    el("div", { className: "field" }, [el("label", { text: "邀请码（可选）" }), invite]),
    btn
  );

  box.addEventListener("submit", async (e) => {
    e.preventDefault();
    errHost.replaceChildren();
    btn.disabled = true;
    try {
      const data = await api.register({
        username: username.value.trim(),
        password: password.value,
        inviteCode: invite.value.trim(),
        email: "",
      });
      setSession(data.token, data.user);
      navigate("/admin/dashboard", { replace: true });
    } catch (err) {
      errHost.append(flash("error", err.message || "注册失败"));
    } finally {
      btn.disabled = false;
    }
  });

  root.append(
    authShell("注册商家账号", "注册即送起始额度，立刻可生成测试链接。", box, [
      el("a", { href: "/login", text: "已有账号？登录", onClick: (e) => linkClick(e, "/login") }),
      el("a", { href: "/", text: "返回首页" }),
    ])
  );
}

export function renderReset(root) {
  const box = el("form");
  const errHost = el("div");
  const code = el("input", { required: "true", autocomplete: "off" });
  const pw = el("input", { type: "password", required: "true", minlength: "6", autocomplete: "new-password" });
  const pw2 = el("input", { type: "password", required: "true", minlength: "6", autocomplete: "new-password" });
  const btn = el("button", { className: "btn btn-primary", type: "submit", text: "验证授权码并重置密码" });

  box.append(
    errHost,
    el("p", {
      className: "muted",
      text: "输入你曾兑换过的授权码/额度码，验证通过后直接设置新密码（无需邮箱）。",
    }),
    el("div", { className: "field" }, [el("label", { text: "授权码" }), code]),
    el("div", { className: "field" }, [el("label", { text: "新密码" }), pw]),
    el("div", { className: "field" }, [el("label", { text: "确认新密码" }), pw2]),
    btn
  );

  box.addEventListener("submit", async (e) => {
    e.preventDefault();
    errHost.replaceChildren();
    if (pw.value !== pw2.value) {
      errHost.append(flash("error", "两次密码不一致"));
      return;
    }
    btn.disabled = true;
    try {
      const data = await api.recoverWithCode(code.value.trim(), pw.value);
      setSession(data.token, data.user);
      errHost.append(flash("ok", "密码已重置，正在进入工作台…"));
      setTimeout(() => navigate("/admin/dashboard", { replace: true }), 600);
    } catch (err) {
      errHost.append(flash("error", err.message || "重置失败"));
    } finally {
      btn.disabled = false;
    }
  });

  root.append(
    authShell("授权码找回密码", "与心象测统一授权码体系一致：码即身份凭证。", box, [
      el("a", { href: "/login", text: "返回登录", onClick: (e) => linkClick(e, "/login") }),
      el("a", { href: "/", text: "首页" }),
    ])
  );
}
