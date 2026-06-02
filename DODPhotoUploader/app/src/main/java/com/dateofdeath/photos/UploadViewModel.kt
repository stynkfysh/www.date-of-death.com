package com.dateofdeath.photos

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class UploadState {
    IDLE,
    UPLOADING,
    SUCCESS,
    PARTIAL_FAILURE,
    FAILURE,
}

data class PhotoItem(
    val uri: Uri,
    val fileName: String,
)

data class UiState(
    val email: String = "",
    val address: String = "",
    val notes: String = "",
    val photos: List<PhotoItem> = emptyList(),
    val uploadState: UploadState = UploadState.IDLE,
    val uploadProgress: Float = 0f,          // 0..1
    val uploadStatusText: String = "",
    val uploadedCount: Int = 0,
    val failedNames: List<String> = emptyList(),
)

class UploadViewModel(application: Application) : AndroidViewModel(application) {

    private val api = PhotoUploadApi()
    private val _ui = MutableStateFlow(UiState())
    val ui: StateFlow<UiState> = _ui.asStateFlow()

    fun setEmail(value: String) { _ui.value = _ui.value.copy(email = value) }
    fun setAddress(value: String) { _ui.value = _ui.value.copy(address = value) }
    fun setNotes(value: String) { _ui.value = _ui.value.copy(notes = value) }

    /** Add photos from gallery or camera, skipping duplicates. */
    fun addPhotos(uris: List<Uri>) {
        val context = getApplication<Application>()
        val existing = _ui.value.photos.map { it.uri }.toSet()
        val newItems = uris
            .filter { it !in existing }
            .map { uri ->
                val name = getDisplayName(context, uri)
                PhotoItem(uri, name)
            }
        _ui.value = _ui.value.copy(photos = _ui.value.photos + newItems)
    }

    fun removePhoto(index: Int) {
        val updated = _ui.value.photos.toMutableList().apply { removeAt(index) }
        _ui.value = _ui.value.copy(photos = updated)
    }

    fun canSubmit(): Boolean {
        val s = _ui.value
        return s.email.isNotBlank() && s.address.isNotBlank() && s.photos.isNotEmpty()
                && s.uploadState != UploadState.UPLOADING
    }

    fun startUpload() {
        if (!canSubmit()) return
        val state = _ui.value
        _ui.value = state.copy(
            uploadState = UploadState.UPLOADING,
            uploadProgress = 0f,
            uploadStatusText = "Preparing…",
            uploadedCount = 0,
            failedNames = emptyList(),
        )

        viewModelScope.launch(Dispatchers.IO) {
            val photos = state.photos
            val total = photos.size
            var folderId: String? = null
            var uploaded = 0
            val failed = mutableListOf<String>()

            for ((i, photo) in photos.withIndex()) {
                val isLast = (i == total - 1)
                _ui.value = _ui.value.copy(
                    uploadStatusText = "Uploading ${i + 1} of $total: ${photo.fileName}",
                    uploadProgress = i.toFloat() / total,
                )

                val result = api.uploadPhoto(
                    context = getApplication(),
                    fileUri = photo.uri,
                    email = state.email,
                    propertyAddress = state.address,
                    folderId = folderId,
                    isLast = isLast,
                    notes = if (isLast) state.notes else "",
                    totalCount = total,
                )

                if (result.success) {
                    if (result.folderId != null) folderId = result.folderId
                    uploaded++
                } else {
                    failed.add("${photo.fileName}: ${result.error}")
                }

                _ui.value = _ui.value.copy(
                    uploadProgress = (i + 1).toFloat() / total,
                    uploadedCount = uploaded,
                )
            }

            _ui.value = _ui.value.copy(
                uploadState = when {
                    uploaded == total -> UploadState.SUCCESS
                    uploaded > 0     -> UploadState.PARTIAL_FAILURE
                    else             -> UploadState.FAILURE
                },
                uploadStatusText = when {
                    uploaded == total -> "All $total photos uploaded!"
                    uploaded > 0     -> "$uploaded of $total uploaded"
                    else             -> "Upload failed"
                },
                failedNames = failed,
                uploadProgress = 1f,
            )
        }
    }

    fun reset() {
        _ui.value = UiState()
    }

    private fun getDisplayName(context: android.content.Context, uri: Uri): String {
        if (uri.scheme == "content") {
            context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                val idx = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                if (idx >= 0 && cursor.moveToFirst()) return cursor.getString(idx)
            }
        }
        return uri.lastPathSegment ?: "photo.jpg"
    }
}
