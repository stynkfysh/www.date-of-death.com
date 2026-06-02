package com.dateofdeath.photos

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

data class UploadResult(
    val success: Boolean,
    val folderId: String? = null,
    val folderUrl: String? = null,
    val fileId: String? = null,
    val error: String? = null,
)

class PhotoUploadApi {

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)   // large photos can take a while
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    /**
     * Upload a single photo to the Cloudflare backend.
     * Mirrors the web form's multipart POST to /api/upload-photos.
     */
    fun uploadPhoto(
        context: Context,
        fileUri: Uri,
        email: String,
        propertyAddress: String,
        folderId: String?,
        isLast: Boolean,
        notes: String,
        totalCount: Int,
    ): UploadResult {
        // Read file bytes + metadata
        val contentResolver = context.contentResolver
        val mimeType = contentResolver.getType(fileUri) ?: "image/jpeg"
        val fileName = getFileName(context, fileUri) ?: "photo_${System.currentTimeMillis()}.jpg"
        val fileBytes = contentResolver.openInputStream(fileUri)?.use { it.readBytes() }
            ?: return UploadResult(success = false, error = "Cannot read file")

        // Build multipart body — same fields the web frontend sends
        val bodyBuilder = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("email", email)
            .addFormDataPart("property_address", propertyAddress)
            .addFormDataPart(
                "file", fileName,
                fileBytes.toRequestBody(mimeType.toMediaType())
            )

        if (!folderId.isNullOrEmpty()) {
            bodyBuilder.addFormDataPart("folder_id", folderId)
        }
        if (isLast) {
            bodyBuilder.addFormDataPart("is_last", "true")
            bodyBuilder.addFormDataPart("notes", notes)
            bodyBuilder.addFormDataPart("total_count", totalCount.toString())
        }

        val request = Request.Builder()
            .url(BuildConfig.UPLOAD_API_URL)
            .header("Origin", "https://www.date-of-death.com")
            .header("X-API-Key", BuildConfig.API_KEY)
            .post(bodyBuilder.build())
            .build()

        return try {
            val response = client.newCall(request).execute()
            val body = response.body?.string() ?: ""

            if (response.isSuccessful) {
                val json = JSONObject(body)
                UploadResult(
                    success = true,
                    folderId = json.optString("folderId", null),
                    folderUrl = json.optString("folderUrl", null),
                    fileId = json.optString("fileId", null),
                )
            } else {
                val json = try { JSONObject(body) } catch (_: Exception) { null }
                UploadResult(
                    success = false,
                    error = json?.optString("error") ?: "Upload failed (HTTP ${response.code})"
                )
            }
        } catch (e: IOException) {
            UploadResult(success = false, error = e.message ?: "Network error")
        }
    }

    private fun getFileName(context: Context, uri: Uri): String? {
        if (uri.scheme == "content") {
            context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (nameIndex >= 0 && cursor.moveToFirst()) {
                    return cursor.getString(nameIndex)
                }
            }
        }
        return uri.lastPathSegment
    }
}
