# Native Client Integration (iOS Swift + Android Kotlin)

## Goal

Give native mobile teams a direct path to:

1. Fetch token from token server
2. Connect to LiveKit room
3. Keep backend integration contract aligned via OpenAPI

## API contracts to share with native teams

- `openapi/token-server.yaml`
- `openapi/tool-backend.yaml`

These can be used with OpenAPI Generator to create Swift/Kotlin clients.

---

## iOS (Swift)

### 1) Fetch token

```swift
import Foundation

struct TokenResponse: Decodable {
  let token: String
  let room: String
  let identity: String
  let ttl: String
  let agentName: String
}

func fetchToken(baseUrl: String, room: String, identity: String, apiKey: String?) async throws -> String {
  var components = URLComponents(string: "\(baseUrl)/token")!
  components.queryItems = [
    URLQueryItem(name: "room", value: room),
    URLQueryItem(name: "identity", value: identity)
  ]

  var request = URLRequest(url: components.url!)
  if let apiKey, !apiKey.isEmpty {
    request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
  }

  let (data, response) = try await URLSession.shared.data(for: request)
  guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
    throw NSError(domain: "Token", code: 1)
  }

  let parsed = try JSONDecoder().decode(TokenResponse.self, from: data)
  return parsed.token
}
```

### 2) Connect with LiveKit Swift SDK

```swift
import LiveKit

let room = Room()
let token = try await fetchToken(baseUrl: tokenBaseUrl, room: "test_room", identity: "ios_user", apiKey: tokenApiKey)
try await room.connect(url: livekitWsUrl, token: token)
```

---

## Android (Kotlin)

### 1) Fetch token

```kotlin
data class TokenResponse(
  val token: String,
  val room: String,
  val identity: String,
  val ttl: String,
  val agentName: String,
)

suspend fun fetchToken(baseUrl: String, room: String, identity: String, apiKey: String?): TokenResponse {
  val url = "$baseUrl/token?room=$room&identity=$identity"
  val requestBuilder = okhttp3.Request.Builder().url(url)
  if (!apiKey.isNullOrBlank()) {
    requestBuilder.addHeader("x-api-key", apiKey)
  }
  val request = requestBuilder.build()
  val client = okhttp3.OkHttpClient()

  client.newCall(request).execute().use { resp ->
    if (!resp.isSuccessful) error("Token fetch failed: ${resp.code}")
    val body = resp.body?.string() ?: error("Missing body")
    return kotlinx.serialization.json.Json.decodeFromString(body)
  }
}
```

### 2) Connect with LiveKit Android SDK

```kotlin
val token = fetchToken(tokenBaseUrl, "test_room", "android_user", tokenApiKey).token
val room = io.livekit.android.room.Room(appContext)
room.connect(livekitWsUrl, token)
```

---

## Generate native API clients from OpenAPI

### Swift

```bash
openapi-generator-cli generate \
  -i openapi/token-server.yaml \
  -g swift5 \
  -o generated/swift/token-api
```

### Kotlin

```bash
openapi-generator-cli generate \
  -i openapi/token-server.yaml \
  -g kotlin \
  -o generated/kotlin/token-api
```

Repeat for `openapi/tool-backend.yaml` when native app also needs direct tools API calls.

## Security recommendation

For production, avoid direct app calls to internal tools API unless necessary.
Preferred pattern: app -> your BFF -> tools backend.
If direct call is required and backend auth is enabled, send `Authorization: Bearer <token>`.
