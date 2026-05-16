// src/components/PDFGenerator.js
import jsPDF from "jspdf";

function PDFGenerator({ lender, borrower, amount }) {
  const generatePDF = () => {
    const doc = new jsPDF();
    doc.text("Promissory Note", 20, 20);
    doc.text(`Lender: ${lender}`, 20, 40);
    doc.text(`Borrower: ${borrower}`, 20, 60);
    doc.text(`Amount: ₹${amount}`, 20, 80);
    doc.save("promissory_note.pdf");
  };

  return <button onClick={generatePDF}>Download Promissory Note</button>;
}

export default PDFGenerator;
