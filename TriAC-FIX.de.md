([find English version here](TriAC-FIX.en.md))

# Einbau des KS-Fix auf dem Mainboard

Falls bei dir das Problem besteht, dass der Kühlschrank dauerhaft läuft, er keine Ein- und Ausschaltsignale vom Modul 
annimmt, dann ist der Triac defekt. Erkennbar ist dies, wenn die Rückwand vereist ist und im "Graph Dashbord" die 
Luftfeuchtigkeit über Stunden konstant bleibt und unter dem eingestellten Sollwert liegt.

## Overview

Es gibt leider einen Serienfehler bei Modulen vor der Seriennummer 13115. Bei diesem Fehler ist ein Bauteil zu schwach 
ausgelegt und wird über kurz oder lang defekt werden.

### Details

Mittels der KS-Fix Dateien, die über den Hardwarebereich auf der Github Plantalytix Seite zu finden sind, ist eine 
Fertigung z.B. bei Aisler möglich. Günstiger ist es aber über die Community in größerer Stückzahl fertigen zu lassen.

Das Auslöten den defekten TirAC funktioniert am besten mit Heißluft. Das Einlöten des TriAC-Fix-Boards mit einem normalen Lötkolben. Hier 2 Screenshots mit einer Vorher-Nachher Sicht:

#### Vorher
![VORHER](docs/TriAC-FIX_before.jpeg)

#### Nacher
![NACHHER](docs/TriAC-FIX_after.jpeg)
