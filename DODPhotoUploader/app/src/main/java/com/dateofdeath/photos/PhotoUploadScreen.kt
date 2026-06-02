package com.dateofdeath.photos

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddAPhoto
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import coil.compose.AsyncImage
import java.io.File

// Brand colors matching the website
private val Navy = Color(0xFF1A5276)
private val Green = Color(0xFF27AE60)
private val LightBlue = Color(0xFFF0F6FB)
private val BorderBlue = Color(0xFFD0E3F0)
private val BgGray = Color(0xFFFAFBFC)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PhotoUploadScreen(viewModel: UploadViewModel) {
    val ui by viewModel.ui.collectAsState()
    val context = LocalContext.current
    val scrollState = rememberScrollState()

    // --- Camera setup ---
    var cameraUri by remember { mutableStateOf<Uri?>(null) }

    fun createTempImageUri(): Uri {
        val dir = File(context.cacheDir, "camera").apply { mkdirs() }
        val file = File(dir, "photo_${System.currentTimeMillis()}.jpg")
        return FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    }

    val cameraLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicture()
    ) { success ->
        if (success && cameraUri != null) {
            viewModel.addPhotos(listOf(cameraUri!!))
        }
    }

    // Camera permission
    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            val uri = createTempImageUri()
            cameraUri = uri
            cameraLauncher.launch(uri)
        }
    }

    fun launchCamera() {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED
        ) {
            val uri = createTempImageUri()
            cameraUri = uri
            cameraLauncher.launch(uri)
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    // --- Gallery picker ---
    val galleryLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(maxItems = 30)
    ) { uris ->
        if (uris.isNotEmpty()) viewModel.addPhotos(uris)
    }

    fun launchGallery() {
        galleryLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
    }

    // --- UI ---
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Submit Property Photos", fontWeight = FontWeight.SemiBold) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Navy,
                    titleContentColor = Color.White,
                ),
            )
        },
        containerColor = BgGray,
    ) { padding ->

        if (ui.uploadState == UploadState.SUCCESS) {
            // ───── Success screen ─────
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Icon(
                    Icons.Filled.CheckCircle,
                    contentDescription = null,
                    tint = Green,
                    modifier = Modifier.size(72.dp),
                )
                Spacer(Modifier.height(16.dp))
                Text(
                    "Photos Received!",
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = Navy,
                )
                Spacer(Modifier.height(12.dp))
                Text(
                    "Your property photos have been uploaded. Our appraiser will review them along with your order details.",
                    textAlign = TextAlign.Center,
                    color = Color(0xFF555555),
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    "If we need additional photos, we'll reach out to the email address you provided.",
                    textAlign = TextAlign.Center,
                    color = Color(0xFF555555),
                    fontSize = 14.sp,
                )
                Spacer(Modifier.height(32.dp))
                Button(
                    onClick = { viewModel.reset() },
                    colors = ButtonDefaults.buttonColors(containerColor = Navy),
                    shape = RoundedCornerShape(8.dp),
                ) {
                    Text("Submit More Photos")
                }
            }
        } else {
            // ───── Main form ─────
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(scrollState)
                    .padding(horizontal = 20.dp, vertical = 16.dp),
            ) {
                // ── Order info ──
                SectionCard(title = "Your Order") {
                    OutlinedTextField(
                        value = ui.email,
                        onValueChange = viewModel::setEmail,
                        label = { Text("Email Address *") },
                        placeholder = { Text("you@example.com") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Email,
                            imeAction = ImeAction.Next,
                        ),
                        modifier = Modifier.fillMaxWidth(),
                        colors = dodTextFieldColors(),
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = ui.address,
                        onValueChange = viewModel::setAddress,
                        label = { Text("Property Address *") },
                        placeholder = { Text("e.g. 123 Main St, Los Angeles") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                        modifier = Modifier.fillMaxWidth(),
                        colors = dodTextFieldColors(),
                    )
                }

                Spacer(Modifier.height(16.dp))

                // ── Photo instructions ──
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = LightBlue),
                    shape = RoundedCornerShape(10.dp),
                ) {
                    Column(Modifier.padding(20.dp)) {
                        Text(
                            "What Photos Do We Need?",
                            fontWeight = FontWeight.SemiBold,
                            color = Navy,
                            fontSize = 16.sp,
                        )
                        Spacer(Modifier.height(8.dp))
                        val items = listOf(
                            "Front of home — straight-on view from the street",
                            "Street scene — looking down the street each direction",
                            "Backyard — yard and any structures (pool, patio, ADU)",
                            "Kitchen — countertops, cabinets, appliances",
                            "Bathrooms — at least the primary",
                            "Living areas — living room, family room, dining room",
                            "Any recent upgrades — flooring, roof, HVAC, windows, solar",
                            "Any condition issues — deferred maintenance, damage",
                        )
                        items.forEach { item ->
                            Text(
                                "• $item",
                                fontSize = 14.sp,
                                color = Color(0xFF444444),
                                lineHeight = 20.sp,
                                modifier = Modifier.padding(vertical = 2.dp),
                            )
                        }
                        Spacer(Modifier.height(10.dp))
                        Text(
                            "Tip: Take photos in landscape with good lighting. More is always better!",
                            fontSize = 13.sp,
                            fontStyle = FontStyle.Italic,
                            color = Color(0xFF666666),
                        )
                    }
                }

                Spacer(Modifier.height(16.dp))

                // ── Add photos buttons ──
                SectionCard(title = "Photos") {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        OutlinedButton(
                            onClick = { launchCamera() },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(8.dp),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Navy),
                        ) {
                            Icon(Icons.Filled.AddAPhoto, contentDescription = null, modifier = Modifier.size(20.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Camera")
                        }
                        OutlinedButton(
                            onClick = { launchGallery() },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(8.dp),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Navy),
                        ) {
                            Icon(Icons.Filled.PhotoLibrary, contentDescription = null, modifier = Modifier.size(20.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Gallery")
                        }
                    }

                    // ── Thumbnail grid ──
                    if (ui.photos.isNotEmpty()) {
                        Spacer(Modifier.height(16.dp))
                        Text(
                            "${ui.photos.size} photo${if (ui.photos.size != 1) "s" else ""} selected",
                            fontSize = 14.sp,
                            color = Color(0xFF555555),
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Spacer(Modifier.height(8.dp))

                        // Fixed-height grid so scrolling works inside the scroll column
                        val rows = (ui.photos.size + 2) / 3
                        val gridHeight = (rows * 120).dp

                        LazyVerticalGrid(
                            columns = GridCells.Fixed(3),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(gridHeight),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            userScrollEnabled = false,
                        ) {
                            itemsIndexed(ui.photos) { index, photo ->
                                Box(
                                    modifier = Modifier
                                        .aspectRatio(1f)
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(Color(0xFFEEEEEE)),
                                ) {
                                    AsyncImage(
                                        model = photo.uri,
                                        contentDescription = photo.fileName,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier.fillMaxSize(),
                                    )
                                    // Remove button
                                    if (ui.uploadState != UploadState.UPLOADING) {
                                        Box(
                                            modifier = Modifier
                                                .align(Alignment.TopEnd)
                                                .padding(4.dp)
                                                .size(24.dp)
                                                .background(Color(0x99000000), CircleShape)
                                                .clickable { viewModel.removePhoto(index) },
                                            contentAlignment = Alignment.Center,
                                        ) {
                                            Icon(
                                                Icons.Filled.Close,
                                                contentDescription = "Remove",
                                                tint = Color.White,
                                                modifier = Modifier.size(16.dp),
                                            )
                                        }
                                    }
                                    // File name label
                                    Box(
                                        modifier = Modifier
                                            .align(Alignment.BottomCenter)
                                            .fillMaxWidth()
                                            .background(Color(0x88000000))
                                            .padding(horizontal = 6.dp, vertical = 3.dp),
                                    ) {
                                        Text(
                                            photo.fileName,
                                            fontSize = 10.sp,
                                            color = Color.White,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                Spacer(Modifier.height(16.dp))

                // ── Notes ──
                SectionCard(title = "Additional Notes") {
                    OutlinedTextField(
                        value = ui.notes,
                        onValueChange = viewModel::setNotes,
                        placeholder = { Text("e.g., Kitchen remodeled in 2020, roof replaced 2018…") },
                        minLines = 2,
                        maxLines = 5,
                        modifier = Modifier.fillMaxWidth(),
                        colors = dodTextFieldColors(),
                    )
                }

                Spacer(Modifier.height(16.dp))

                // ── Upload progress ──
                if (ui.uploadState == UploadState.UPLOADING) {
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .animateContentSize()
                    ) {
                        LinearProgressIndicator(
                            progress = { ui.uploadProgress },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(8.dp)
                                .clip(RoundedCornerShape(4.dp)),
                            color = Green,
                            trackColor = Color(0xFFE8E8E8),
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            ui.uploadStatusText,
                            fontSize = 14.sp,
                            color = Color(0xFF555555),
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Spacer(Modifier.height(16.dp))
                    }
                }

                // ── Error messages ──
                if (ui.uploadState == UploadState.FAILURE || ui.uploadState == UploadState.PARTIAL_FAILURE) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFFFDF0EF)),
                        shape = RoundedCornerShape(8.dp),
                    ) {
                        Column(Modifier.padding(16.dp)) {
                            Text(
                                if (ui.uploadState == UploadState.PARTIAL_FAILURE)
                                    "${ui.uploadedCount} photo(s) uploaded, but some failed:"
                                else
                                    "Upload failed. Please try again or email photos to photos@date-of-death.com",
                                color = Color(0xFFC0392B),
                                fontSize = 14.sp,
                            )
                            ui.failedNames.forEach { msg ->
                                Text("• $msg", fontSize = 13.sp, color = Color(0xFFC0392B))
                            }
                        }
                    }
                    Spacer(Modifier.height(16.dp))
                }

                // ── Submit button ──
                Button(
                    onClick = { viewModel.startUpload() },
                    enabled = viewModel.canSubmit(),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Navy,
                        disabledContainerColor = Color(0xFFB0B0B0),
                    ),
                    shape = RoundedCornerShape(8.dp),
                ) {
                    Text(
                        when (ui.uploadState) {
                            UploadState.UPLOADING -> "Uploading…"
                            UploadState.PARTIAL_FAILURE -> "Retry"
                            UploadState.FAILURE -> "Try Again"
                            else -> "Submit Photos"
                        },
                        fontSize = 17.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }

                Spacer(Modifier.height(8.dp))
                Text(
                    if (ui.photos.isEmpty()) "Select at least one photo to continue."
                    else if (ui.email.isBlank() || ui.address.isBlank()) "Fill in email and address to continue."
                    else "Ready to upload.",
                    fontSize = 13.sp,
                    color = if (viewModel.canSubmit()) Green else Color(0xFF888888),
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )

                Spacer(Modifier.height(24.dp))

                // ── Alt methods ──
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFF8F9FA)),
                    shape = RoundedCornerShape(10.dp),
                ) {
                    Column(Modifier.padding(20.dp)) {
                        Text("Other Ways to Submit Photos", fontWeight = FontWeight.SemiBold, color = Navy, fontSize = 15.sp)
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "You can also email photos to photos@date-of-death.com with the property address in the subject line, or text them to (858) 215-3954.",
                            fontSize = 14.sp,
                            color = Color(0xFF555555),
                            lineHeight = 20.sp,
                        )
                    }
                }

                Spacer(Modifier.height(32.dp))
            }
        }
    }
}

// ───── Reusable components ─────

@Composable
private fun SectionCard(
    title: String,
    content: @Composable ColumnScope.() -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        shape = RoundedCornerShape(12.dp),
    ) {
        Column(Modifier.padding(20.dp)) {
            Text(title, fontWeight = FontWeight.SemiBold, color = Navy, fontSize = 16.sp)
            Spacer(Modifier.height(12.dp))
            content()
        }
    }
}

@Composable
private fun dodTextFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = Navy,
    focusedLabelColor = Navy,
    cursorColor = Navy,
)
