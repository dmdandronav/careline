/*
  CareLine — Button Node
  A single pushbutton connected to an ESP32.
  On press, POSTs to the Flask backend to trigger a check-in conversation.

  WIRING:
    Button: one leg -> GPIO 0, other leg -> GND (uses INPUT_PULLUP)
    Optional LED: GPIO 2 (built-in LED on most ESP32 dev boards)

  Note: GPIO 0 is the BOOT button on most ESP32 dev boards —
  perfect for demos since it's already there!
*/
#include <WiFi.h>
#include <HTTPClient.h>

const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* SERVER_URL = "http://192.168.1.100:5000/api/button";

#define BTN_PIN 0
#define LED_PIN 2

void setup() {
  Serial.begin(115200);
  pinMode(BTN_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) { delay(500); }
  Serial.println("CareLine button online: " + WiFi.localIP().toString());
  // Blink to confirm connected
  for (int i = 0; i < 3; i++) { digitalWrite(LED_PIN, HIGH); delay(200); digitalWrite(LED_PIN, LOW); delay(200); }
}

unsigned long lastPress = 0;
bool lastState = HIGH;

void loop() {
  bool current = digitalRead(BTN_PIN);
  if (lastState == HIGH && current == LOW && millis() - lastPress > 2000) {
    lastPress = millis();
    Serial.println("Button pressed — sending check-in event");
    digitalWrite(LED_PIN, HIGH);

    HTTPClient http;
    http.begin(SERVER_URL);
    http.addHeader("Content-Type", "application/json");
    http.POST("{\"event\":\"button_pressed\",\"source\":\"physical_button\"}");
    http.end();

    delay(100);
    digitalWrite(LED_PIN, LOW);
  }
  lastState = current;
  delay(20);
}
