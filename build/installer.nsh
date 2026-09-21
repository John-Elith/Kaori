; Pasos extra del instalador de Kaori. (Sin tildes a proposito: NSIS puede
; leer mal los caracteres acentuados segun la codificacion del archivo.)
;
; El acceso desde el telefono necesita que Windows deje entrar conexiones de
; la red local. Sin esta regla, la primera vez que se activa sale el aviso del
; cortafuegos, y si se responde mal -o nadie lo ve- el telefono no conecta.
;
; Solo para redes privadas (la Wi-Fi de la oficina), nunca publicas (la de un
; cafe). Si el instalador no corre como administrador, netsh falla sin mas y
; Windows preguntara al activar el acceso, como antes.

!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Kaori - acceso desde el telefono"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Kaori - acceso desde el telefono" dir=in action=allow program="$INSTDIR\Kaori.exe" protocol=TCP localport=47800-47809 profile=private enable=yes'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Kaori - acceso desde el telefono"'
!macroend
