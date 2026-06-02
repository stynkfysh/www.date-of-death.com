package com.dateofdeath.photos

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.viewmodel.compose.viewModel

private val Navy = Color(0xFF1A5276)
private val Green = Color(0xFF27AE60)

private val DODLightColors = lightColorScheme(
    primary = Navy,
    secondary = Green,
    surface = Color.White,
    background = Color(0xFFFAFBFC),
    onPrimary = Color.White,
    onSurface = Color(0xFF333333),
)

private val DODDarkColors = darkColorScheme(
    primary = Color(0xFF5DADE2),
    secondary = Green,
    onPrimary = Color.White,
)

@Composable
fun DODTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) DODDarkColors else DODLightColors,
        content = content,
    )
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            DODTheme {
                val vm: UploadViewModel = viewModel()
                PhotoUploadScreen(viewModel = vm)
            }
        }
    }
}
