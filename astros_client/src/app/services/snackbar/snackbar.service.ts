import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({
  providedIn: 'root',
})
export class SnackbarService {
  constructor(private snackBar: MatSnackBar) {}

  public okToast(message: string) {
    this.snackBar.open(message, 'OK', { duration: 4000 });
  }
}
