use std::time::Duration;

#[cfg(any(target_os = "macos", test))]
const PROXY_ENV_VARS: [&str; 6] = [
    "ALL_PROXY",
    "all_proxy",
    "HTTPS_PROXY",
    "https_proxy",
    "HTTP_PROXY",
    "http_proxy",
];

/// Build an HTTP client for the small ACP registry response.
pub(crate) fn build_registry_http_client() -> Result<reqwest::Client, String> {
    build_http_client(reqwest::Client::builder().timeout(Duration::from_secs(15)))
}

/// Build an HTTP client for agent archives without imposing a total transfer deadline.
pub(crate) fn build_download_http_client() -> Result<reqwest::Client, String> {
    build_http_client(
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(15))
            .read_timeout(Duration::from_secs(60)),
    )
}

/// Apply the macOS system proxy only when an environment proxy is not configured.
fn build_http_client(builder: reqwest::ClientBuilder) -> Result<reqwest::Client, String> {
    #[cfg(target_os = "macos")]
    let builder = if environment_proxy_is_configured() {
        builder
    } else {
        match read_macos_system_proxy() {
            Some(settings) if settings.has_proxy() => {
                let no_proxy = settings.no_proxy();
                let proxy = reqwest::Proxy::custom(move |url| settings.proxy_for_url(url))
                    .no_proxy(no_proxy);
                builder.proxy(proxy)
            }
            _ => builder,
        }
    };

    builder
        .build()
        .map_err(|error| format!("Failed to build HTTP client: {error}"))
}

#[cfg(any(target_os = "macos", test))]
fn environment_proxy_is_configured() -> bool {
    environment_proxy_is_configured_with(|name| std::env::var_os(name))
}

#[cfg(any(target_os = "macos", test))]
fn environment_proxy_is_configured_with(
    mut read_env: impl FnMut(&str) -> Option<std::ffi::OsString>,
) -> bool {
    PROXY_ENV_VARS
        .iter()
        .any(|name| read_env(name).is_some_and(|value| !value.is_empty()))
}

#[cfg(any(target_os = "macos", test))]
#[derive(Default)]
struct ProxySettings {
    enabled: bool,
    host: Option<String>,
    port: Option<u16>,
}

#[cfg(any(target_os = "macos", test))]
impl ProxySettings {
    fn url(&self, scheme: &str) -> Option<String> {
        if !self.enabled {
            return None;
        }

        let host = self.host.as_deref()?;
        let port = self.port?;
        let authority = if host.contains(':') && !host.starts_with('[') {
            format!("[{host}]")
        } else {
            host.to_string()
        };
        Some(format!("{scheme}://{authority}:{port}"))
    }
}

#[cfg(any(target_os = "macos", test))]
#[derive(Clone, Debug, Default, PartialEq, Eq)]
struct MacosProxySettings {
    http: Option<String>,
    https: Option<String>,
    socks: Option<String>,
    exceptions: Vec<String>,
    exclude_simple_hostnames: bool,
}

#[cfg(any(target_os = "macos", test))]
impl MacosProxySettings {
    fn has_proxy(&self) -> bool {
        self.http.is_some() || self.https.is_some() || self.socks.is_some()
    }

    fn proxy_for_url(&self, url: &reqwest::Url) -> Option<String> {
        if self.exclude_simple_hostnames
            && url
                .host_str()
                .is_some_and(|host| !host.contains('.') && !host.contains(':'))
        {
            return None;
        }

        match url.scheme() {
            "http" => self.http.clone().or_else(|| self.socks.clone()),
            "https" => self.https.clone().or_else(|| self.socks.clone()),
            _ => self.socks.clone(),
        }
    }

    fn no_proxy(&self) -> Option<reqwest::NoProxy> {
        let environment = std::env::var("NO_PROXY")
            .or_else(|_| std::env::var("no_proxy"))
            .ok();
        let entries = self.no_proxy_entries(environment.as_deref());
        if entries.is_empty() {
            None
        } else {
            reqwest::NoProxy::from_string(&entries.join(","))
        }
    }

    fn no_proxy_entries(&self, environment: Option<&str>) -> Vec<String> {
        let mut entries: Vec<String> = self
            .exceptions
            .iter()
            .filter_map(|entry| normalize_exception(entry))
            .collect();
        if let Some(environment) = environment {
            entries.push(environment.to_string());
        }
        entries
    }
}

#[cfg(any(target_os = "macos", test))]
fn normalize_exception(entry: &str) -> Option<String> {
    let entry = entry.trim();
    if entry.is_empty() {
        return None;
    }

    Some(match entry.strip_prefix("*.") {
        Some(suffix) => format!(".{suffix}"),
        None => entry.to_string(),
    })
}

#[cfg(any(target_os = "macos", test))]
fn parse_exception_entry(line: &str) -> Option<String> {
    let (index, value) = line.split_once(" : ")?;
    index.trim().parse::<usize>().ok()?;
    Some(value.trim().to_string())
}

/// Parse the protocol-specific proxies and bypass rules from `scutil --proxy`.
#[cfg(any(target_os = "macos", test))]
fn parse_macos_system_proxy(output: &str) -> MacosProxySettings {
    let mut https = ProxySettings::default();
    let mut http = ProxySettings::default();
    let mut socks = ProxySettings::default();
    let mut exceptions = Vec::new();
    let mut exclude_simple_hostnames = false;
    let mut in_exceptions = false;

    for line in output.lines() {
        let line = line.trim();

        if in_exceptions {
            match (line, parse_exception_entry(line)) {
                ("}", _) => {
                    in_exceptions = false;
                    continue;
                }
                (_, Some(exception)) => {
                    exceptions.push(exception);
                    continue;
                }
                _ => {}
            }
        }

        let Some((key, value)) = line.split_once(" : ") else {
            continue;
        };
        let value = value.trim();

        match key.trim() {
            "ExceptionsList" => in_exceptions = value.starts_with("<array>"),
            "ExcludeSimpleHostnames" => exclude_simple_hostnames = value == "1",
            "HTTPSEnable" => https.enabled = value == "1",
            "HTTPSProxy" => https.host = Some(value.to_string()),
            "HTTPSPort" => https.port = value.parse().ok(),
            "HTTPEnable" => http.enabled = value == "1",
            "HTTPProxy" => http.host = Some(value.to_string()),
            "HTTPPort" => http.port = value.parse().ok(),
            "SOCKSEnable" => socks.enabled = value == "1",
            "SOCKSProxy" => socks.host = Some(value.to_string()),
            "SOCKSPort" => socks.port = value.parse().ok(),
            _ => {}
        }
    }

    MacosProxySettings {
        http: http.url("http"),
        https: https.url("http"),
        socks: socks.url("socks5h"),
        exceptions,
        exclude_simple_hostnames,
    }
}

#[cfg(target_os = "macos")]
fn read_macos_system_proxy() -> Option<MacosProxySettings> {
    let output = std::process::Command::new("scutil")
        .arg("--proxy")
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    Some(parse_macos_system_proxy(&String::from_utf8_lossy(
        &output.stdout,
    )))
}

#[cfg(test)]
mod tests {
    use super::{environment_proxy_is_configured_with, parse_macos_system_proxy};
    use std::ffi::OsString;

    #[test]
    fn preserves_protocol_specific_proxies() {
        let output = r#"
<dictionary> {
  HTTPEnable : 1
  HTTPPort : 8080
  HTTPProxy : http-proxy.local
  HTTPSEnable : 1
  HTTPSPort : 6152
  HTTPSProxy : 127.0.0.1
}
"#;
        let settings = parse_macos_system_proxy(output);

        assert_eq!(
            settings.proxy_for_url(&reqwest::Url::parse("https://registry.example").unwrap()),
            Some("http://127.0.0.1:6152".to_string())
        );
        assert_eq!(
            settings.proxy_for_url(&reqwest::Url::parse("http://archive.example").unwrap()),
            Some("http://http-proxy.local:8080".to_string())
        );
    }

    #[test]
    fn does_not_use_http_proxy_for_https_requests() {
        let output = r#"
<dictionary> {
  HTTPEnable : 1
  HTTPPort : 8080
  HTTPProxy : proxy.local
  HTTPSEnable : 0
  HTTPSPort : 6152
  HTTPSProxy : 127.0.0.1
}
"#;
        let settings = parse_macos_system_proxy(output);

        assert_eq!(
            settings.proxy_for_url(&reqwest::Url::parse("http://archive.example").unwrap()),
            Some("http://proxy.local:8080".to_string())
        );
        assert_eq!(
            settings.proxy_for_url(&reqwest::Url::parse("https://registry.example").unwrap()),
            None
        );
    }

    #[test]
    fn ignores_disabled_or_incomplete_proxy_settings() {
        let output = r#"
<dictionary> {
  HTTPEnable : 0
  HTTPPort : 8080
  HTTPProxy : proxy.local
  HTTPSEnable : 1
  HTTPSPort : invalid
}
"#;

        assert!(!parse_macos_system_proxy(output).has_proxy());
    }

    #[test]
    fn formats_ipv6_proxy_hosts() {
        let output = r#"
<dictionary> {
  HTTPSEnable : 1
  HTTPSPort : 6152
  HTTPSProxy : ::1
}
"#;

        assert_eq!(
            parse_macos_system_proxy(output)
                .proxy_for_url(&reqwest::Url::parse("https://registry.example").unwrap()),
            Some("http://[::1]:6152".to_string())
        );
    }

    #[test]
    fn falls_back_to_enabled_socks_proxy() {
        let output = r#"
<dictionary> {
  HTTPEnable : 0
  HTTPSEnable : 0
  SOCKSEnable : 1
  SOCKSPort : 1080
  SOCKSProxy : 127.0.0.1
}
"#;

        let settings = parse_macos_system_proxy(output);
        for url in ["http://archive.example", "https://registry.example"] {
            assert_eq!(
                settings.proxy_for_url(&reqwest::Url::parse(url).unwrap()),
                Some("socks5h://127.0.0.1:1080".to_string())
            );
        }
        reqwest::Proxy::all(settings.socks.unwrap()).expect("SOCKS proxy feature is enabled");
    }

    #[test]
    fn parses_macos_bypass_rules() {
        let output = r#"
<dictionary> {
  ExceptionsList : <array> {
    0 : *.local
    1 : 169.254.0.0/16
  }
  ExcludeSimpleHostnames : 1
  HTTPSEnable : 1
  HTTPSPort : 6152
  HTTPSProxy : proxy.local
}
"#;
        let settings = parse_macos_system_proxy(output);

        assert_eq!(
            settings.no_proxy_entries(Some("internal.example")),
            [".local", "169.254.0.0/16", "internal.example"]
        );
        assert_eq!(
            settings.proxy_for_url(&reqwest::Url::parse("https://intranet/path").unwrap()),
            None
        );
        assert_eq!(
            settings.proxy_for_url(&reqwest::Url::parse("https://public.example/path").unwrap()),
            Some("http://proxy.local:6152".to_string())
        );
    }

    #[test]
    fn recognizes_uppercase_and_lowercase_environment_proxies() {
        for configured_name in ["ALL_PROXY", "https_proxy", "HTTP_PROXY"] {
            assert!(environment_proxy_is_configured_with(|name| {
                (name == configured_name).then(|| OsString::from("http://proxy.local:8080"))
            }));
        }

        assert!(!environment_proxy_is_configured_with(|_| None));
        assert!(!environment_proxy_is_configured_with(|_| {
            Some(OsString::new())
        }));
    }
}
