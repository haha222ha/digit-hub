import { api, setSession } from "../api.js";
import { el, flash } from "../ui.js";
import { navigate, linkClick } from "../router.js";

function authShell(title, sub, formNode, footerLinks) {
  return el("div", { className: "auth-screen" }, [
    el("aside", { className: "auth-brand" }, [
      el("img", { className: "mark", src: "/images/logo.svg", alt: "心象测" }),
      el("h1", { text: "心象测" }),
      el("p", {
        text: "生成可分发的心理测试链接。用户测完即可查看完整报告——为商家分销场景而做。",
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
  const box = el("form", { className: "auth-form" });
  const errHost = el("div");
  const user = el("input", { type: "text", name: "user", autocomplete: "username", required: "true" });
  const pass = el("input", { type: "password", name: "password", autocomplete: "current-password", required: "true" });
  const btn = el("button", { className: "btn btn-primary", type: "submit", text: "登录" });

  box.append(
    errHost,
    el("div", { className: "field" }, [el("label", { text: "用户名或邮箱" }), user]),
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
      navigate("/admin/generate-link", { replace: true });
    } catch (err) {
      errHost.append(flash("error", err.message || "登录失败"));
    } finally {
      btn.disabled = false;
    }
  });

  root.append(
    authShell("登录工作台", "使用你的商家账号进入心象测。", box, [
      el("a", {
        href: "/register",
        text: "没有账号？注册",
        onClick: (e) => linkClick(e, "/register"),
      }),
      el("a", { href: "/", text: "返回首页" }),
    ])
  );
}

export function renderRegister(root) {
  const box = el("form");
  const errHost = el("div");
  const username = el("input", { required: "true", minlength: "3", maxlength: "50", autocomplete: "username" });
  const email = el("input", { type: "email", autocomplete: "email" });
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
    el("div", { className: "field" }, [el("label", { text: "用户名（3–50 字）" }), username]),
    el("div", { className: "field" }, [el("label", { text: "邮箱（可选）" }), email]),
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
        email: email.value.trim(),
        password: password.value,
        inviteCode: invite.value.trim(),
      });
      setSession(data.token, data.user);
      navigate("/admin/generate-link", { replace: true });
    } catch (err) {
      errHost.append(flash("error", err.message || "注册失败"));
    } finally {
      btn.disabled = false;
    }
  });

  root.append(
    authShell("注册商家账号", "注册后即可生成测试链接；起始额度由系统发放。", box, [
      el("a", {
        href: "/login",
        text: "已有账号？登录",
        onClick: (e) => linkClick(e, "/login"),
      }),
      el("a", { href: "/", text: "返回首页" }),
    ])
  );
}

export function renderReset(root) {
  root.append(
    authShell(
      "重置密码",
      "当前版本请联系客服协助重置。你也可以返回登录页重试。",
      el("div", {}, [
        flash("ok", "安全重置接口将在后续版本开放。"),
        el("div", { className: "row-actions" }, [
          el("a", {
            className: "btn btn-primary",
            href: "/login",
            text: "返回登录",
            style: "text-align:center",
            onClick: (e) => linkClick(e, "/login"),
          }),
        ]),
      ]),
      [el("a", { href: "/", text: "返回首页" })]
    )
  );
}
