import Foundation

// MARK: - API Client

@MainActor
final class APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private var authToken: String?

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 120
        self.session = URLSession(configuration: config)
    }

    func setAuthToken(_ token: String?) {
        authToken = token
    }

    // MARK: - Generic GET

    func get<T: Decodable>(_ endpoint: Endpoint) async throws -> T {
        let request = try buildRequest(endpoint: endpoint, body: nil as Data?)
        return try await execute(request)
    }

    // MARK: - Generic POST

    func post<T: Decodable, B: Encodable>(_ endpoint: Endpoint, body: B) async throws -> T {
        let bodyData = try encode(body)
        var request = try buildRequest(endpoint: endpoint, body: bodyData)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await execute(request)
    }

    // MARK: - Streaming POST (SSE)

    func stream<B: Encodable>(_ endpoint: Endpoint, body: B) -> AsyncThrowingStream<String, Error> {
        return AsyncThrowingStream { continuation in
            Task {
                do {
                    let bodyData = try encode(body)
                    var request = try buildRequest(endpoint: endpoint, body: bodyData)
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")

                    let (bytes, response) = try await session.bytes(for: request)

                    guard let httpResponse = response as? HTTPURLResponse else {
                        continuation.finish(throwing: APIError.invalidResponse)
                        return
                    }

                    guard (200...299).contains(httpResponse.statusCode) else {
                        let error = try mapHTTPError(statusCode: httpResponse.statusCode, data: nil)
                        continuation.finish(throwing: error)
                        return
                    }

                    for try await line in bytes.lines {
                        if line.hasPrefix("data: ") {
                            let content = String(line.dropFirst(6))
                            if content == "[DONE]" {
                                continuation.finish()
                                return
                            }
                            continuation.yield(content)
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: APIError.networkError(error))
                }
            }
        }
    }

    // MARK: - Upload

    func upload<T: Decodable>(endpoint: Endpoint, formData: MultipartFormData) async throws -> T {
        var request = URLRequest(url: endpoint.url)
        request.httpMethod = HTTPMethod.post.rawValue

        if let token = authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let boundary = UUID().uuidString
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = formData.build(boundary: boundary)

        return try await execute(request)
    }

    // MARK: - Private Helpers

    private func buildRequest(endpoint: Endpoint, body: Data?) throws -> URLRequest {
        var request = URLRequest(url: endpoint.url)
        request.httpMethod = endpoint.method.rawValue

        if let token = authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("AvatarG-iOS/1.0", forHTTPHeaderField: "User-Agent")

        if let body = body {
            request.httpBody = body
        }

        return request
    }

    private func encode<T: Encodable>(_ value: T) throws -> Data {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        do {
            return try encoder.encode(value)
        } catch {
            throw APIError.encodingError(error)
        }
    }

    private func execute<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        switch httpResponse.statusCode {
        case 200...299:
            break
        case 401:
            throw APIError.unauthorized
        case 404:
            throw APIError.notFound
        default:
            throw try mapHTTPError(statusCode: httpResponse.statusCode, data: data)
        }

        guard !data.isEmpty else {
            throw APIError.noData
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    private func mapHTTPError(statusCode: Int, data: Data?) throws -> APIError {
        if let data = data,
           let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data) {
            return .httpError(statusCode: statusCode, message: errorResponse.message)
        }
        return .httpError(statusCode: statusCode, message: nil)
    }
}

// MARK: - Supporting Types

struct APIErrorResponse: Codable {
    let message: String
    let code: String?
}

struct MultipartFormData {
    var fields: [(name: String, value: String)] = []
    var files: [(name: String, filename: String, mimeType: String, data: Data)] = []

    mutating func append(field name: String, value: String) {
        fields.append((name: name, value: value))
    }

    mutating func append(file name: String, filename: String, mimeType: String, data: Data) {
        files.append((name: name, filename: filename, mimeType: mimeType, data: data))
    }

    func build(boundary: String) -> Data {
        var body = Data()
        let boundaryLine = "--\(boundary)\r\n"
        let finalBoundary = "--\(boundary)--\r\n"

        for field in fields {
            body.append(boundaryLine.data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(field.name)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(field.value)\r\n".data(using: .utf8)!)
        }

        for file in files {
            body.append(boundaryLine.data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(file.name)\"; filename=\"\(file.filename)\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: \(file.mimeType)\r\n\r\n".data(using: .utf8)!)
            body.append(file.data)
            body.append("\r\n".data(using: .utf8)!)
        }

        body.append(finalBoundary.data(using: .utf8)!)
        return body
    }
}
